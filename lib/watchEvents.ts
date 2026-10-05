import type Database from "better-sqlite3";
import { z } from "zod";
import { decodeCurve, encodeCurve, refreshPreviewPoints } from "./heat";
import { HEAT_BUCKETS, viewThreshold } from "./watchRules";

/** How playback of one sitting began. */
export const WATCH_SOURCES = ["click", "autoplay", "resume"] as const;

/**
 * What the player reports, as running totals for the sitting. A report can
 * arrive late or twice, so each one is a total and never an increment.
 * `heat` holds the seconds played in each bucket, see lib/heat.ts.
 */
export const watchReportSchema = z.object({
  session: z.string().regex(/^[\w-]{8,64}$/),
  source: z.enum(WATCH_SOURCES),
  watched: z.number().min(0).max(86_400),
  position: z.number().min(0).max(86_400),
  duration: z.number().positive().max(86_400).nullable(),
  heat: z.array(z.number().min(0).max(86_400)).length(HEAT_BUCKETS).optional(),
});

export type WatchReport = z.infer<typeof watchReportSchema>;

/**
 * Stores one report. The first report of a session creates its row and the
 * later ones only move its totals forward.
 *
 * The sitting adds to the video's views once it has played past
 * viewThreshold, so opening a video and skipping around it is not a view.
 * `views` is the new count when this report added one.
 */
export function recordWatch(
  db: Database.Database,
  videoId: number,
  report: WatchReport,
  now = Date.now(),
): { found: false } | { found: true; views: number | null } {
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO watch_events
           (session, video_id, started_at, watched_sec, max_position, duration, source)
         SELECT @session, id, @now, @watched, @position, @duration, @source
         FROM videos WHERE id = @videoId
         ON CONFLICT(session) DO UPDATE SET
           watched_sec = MAX(watched_sec, excluded.watched_sec),
           max_position = MAX(max_position, excluded.max_position),
           duration = COALESCE(excluded.duration, duration)
         WHERE video_id = excluded.video_id`,
      )
      .run({ ...report, videoId, now });
    if (result.changes === 0) return { found: false as const };

    const row = db
      .prepare(
        `SELECT we.id, we.watched_sec, we.counted, we.heat,
           COALESCE(we.duration, v.duration_sec) AS duration
         FROM watch_events we JOIN videos v ON v.id = we.video_id
         WHERE we.session = ?`,
      )
      .get(report.session) as {
      id: number;
      watched_sec: number;
      counted: number;
      heat: Buffer | null;
      duration: number | null;
    };

    if (report.heat) {
      const stored = decodeCurve(row.heat);
      const merged = report.heat.map((seconds, i) =>
        Math.max(seconds, stored?.[i] ?? 0),
      );
      db.prepare("UPDATE watch_events SET heat = ? WHERE id = ?").run(
        encodeCurve(merged),
        row.id,
      );
      refreshPreviewPoints(db, videoId);
    }

    if (row.counted || row.watched_sec < viewThreshold(row.duration))
      return { found: true as const, views: null };
    db.prepare("UPDATE watch_events SET counted = 1 WHERE id = ?").run(row.id);
    const { views } = db
      .prepare(
        "UPDATE videos SET views = views + 1 WHERE id = ? RETURNING views",
      )
      .get(videoId) as { views: number };
    return { found: true as const, views };
  })();
}
