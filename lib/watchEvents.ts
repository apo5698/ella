import type Database from "better-sqlite3";
import { z } from "zod";

/** How playback of one sitting began. */
export const WATCH_SOURCES = ["click", "autoplay", "resume"] as const;

/**
 * What the player reports, as running totals for the sitting. A report can
 * arrive late or twice, so each one is a total and never an increment.
 */
export const watchReportSchema = z.object({
  session: z.string().regex(/^[\w-]{8,64}$/),
  source: z.enum(WATCH_SOURCES),
  watched: z.number().min(0).max(86_400),
  position: z.number().min(0).max(86_400),
  duration: z.number().positive().max(86_400).nullable(),
});

export type WatchReport = z.infer<typeof watchReportSchema>;

/**
 * Stores one report. The first report of a session creates its row and the
 * later ones only move its totals forward. Returns false for a video that no
 * longer exists.
 */
export function recordWatch(
  db: Database.Database,
  videoId: number,
  report: WatchReport,
  now = Date.now(),
) {
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
  return result.changes > 0;
}
