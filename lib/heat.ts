import type Database from "better-sqlite3";
import { HEAT_BUCKETS, heatBucket } from "./watchRules";

/**
 * Two heat curves per video, each HEAT_BUCKETS values from 0 to 1.
 *
 * The scene curve measures how much the picture changes, from ffmpeg's scene
 * score. It exists as soon as the video is analyzed and is the same for
 * everyone. The watch curve measures which parts viewers actually played and
 * played again; it needs viewers and grows more reliable with each one.
 *
 * Previews visit the peaks of the watch curve once enough people have shaped
 * it, and of the scene curve until then.
 */

/** Distinct viewers before the watch curve outranks the scene curve. */
const WATCH_PREVIEW_VIEWERS = 3;
/** Playback within a bucket shorter than this is passing through, not viewing. */
const MIN_BUCKET_SECONDS = 3;
const PREVIEW_POINTS = 5;
/** Buckets at either end a preview never starts in: leaders and credits. */
const PREVIEW_MARGIN = 2;

export type Heat = { watch: number[] | null; scene: number[] | null };

export function encodeCurve(values: ArrayLike<number>): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buffer.writeFloatLE(values[i], i * 4);
  return buffer;
}

export function decodeCurve(buffer: Buffer | null): number[] | null {
  if (!buffer || buffer.length !== HEAT_BUCKETS * 4) return null;
  return Array.from({ length: HEAT_BUCKETS }, (_, i) =>
    buffer.readFloatLE(i * 4),
  );
}

function smooth(values: number[]) {
  return values.map((_, i) => {
    const from = Math.max(0, i - 1);
    const window = values.slice(from, i + 2);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

/** Scales to a peak of 1, or null when there is no peak. */
function normalize(values: number[]) {
  const peak = Math.max(...values);
  return peak > 0 ? values.map((value) => value / peak) : null;
}

/** A curve that does not rise anywhere says nothing about where to look. */
function isFlat(curve: number[]) {
  const peak = Math.max(...curve);
  return peak <= 0 || peak - Math.min(...curve) < peak * 0.2;
}

/**
 * Averages scene scores into buckets. Keyframe-only analysis leaves buckets
 * without a sample, which take a value between their neighbors.
 */
export function sceneCurve(
  scored: ReadonlyArray<readonly [number, number]>,
  span: number,
): number[] | null {
  if (!(span > 0)) return null;
  const sums = new Array<number>(HEAT_BUCKETS).fill(0);
  const counts = new Array<number>(HEAT_BUCKETS).fill(0);
  for (const [time, score] of scored) {
    const bucket = heatBucket(time, span);
    sums[bucket] += score;
    counts[bucket] += 1;
  }
  const filled = counts.flatMap((count, i) => (count > 0 ? [i] : []));
  if (filled.length === 0) return null;

  const means = sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
  for (let i = 0; i < HEAT_BUCKETS; i++) {
    if (counts[i]) continue;
    const before = filled.findLast((j) => j < i);
    const after = filled.find((j) => j > i);
    if (before === undefined) means[i] = means[after!];
    else if (after === undefined) means[i] = means[before];
    else
      means[i] =
        means[before] +
        ((means[after] - means[before]) * (i - before)) / (after - before);
  }
  return normalize(smooth(means));
}

export type WatchHeatRow = {
  user_id: number | null;
  duration: number | null;
  heat: Buffer | null;
};

/**
 * Sums what each viewer played of each bucket, in plays of that bucket.
 * Every viewer's own curve is scaled to a peak of 1 before they are added, so
 * one person replaying a scene ten times shapes it no more than any other
 * viewer, and a lone viewer's replays still stand out. Sittings without a
 * user, from before accounts existed, belong to one viewer.
 */
export function watchCurve(rows: WatchHeatRow[]): {
  curve: number[] | null;
  viewers: number;
} {
  const byViewer = new Map<number | null, number[]>();
  for (const row of rows) {
    const played = decodeCurve(row.heat);
    if (!played || !row.duration || row.duration <= 0) continue;
    const bucketSeconds = row.duration / HEAT_BUCKETS;
    const least = Math.min(MIN_BUCKET_SECONDS, bucketSeconds / 2);
    const total =
      byViewer.get(row.user_id) ?? new Array<number>(HEAT_BUCKETS).fill(0);
    played.forEach((seconds, i) => {
      if (seconds >= least) total[i] += seconds / bucketSeconds;
    });
    byViewer.set(row.user_id, total);
  }

  const sum = new Array<number>(HEAT_BUCKETS).fill(0);
  let viewers = 0;
  for (const total of byViewer.values()) {
    const scaled = normalize(total);
    if (!scaled) continue;
    viewers += 1;
    scaled.forEach((value, i) => (sum[i] += value));
  }
  return { curve: viewers ? normalize(sum) : null, viewers };
}

/**
 * Where a preview should play: the highest buckets, spread out so that two
 * points never land in the same scene. Fractions of the length, in order.
 */
export function previewPoints(curve: number[]): number[] | null {
  if (isFlat(curve)) return null;
  const values = smooth(curve);
  const spacing = Math.floor(HEAT_BUCKETS / (PREVIEW_POINTS * 2));
  const order = values
    .map((value, i) => ({ value, i }))
    .slice(PREVIEW_MARGIN, HEAT_BUCKETS - PREVIEW_MARGIN)
    .sort((a, b) => b.value - a.value);
  const picked: number[] = [];
  for (const { i } of order) {
    if (picked.length === PREVIEW_POINTS) break;
    if (picked.every((j) => Math.abs(i - j) >= spacing)) picked.push(i);
  }
  return picked.sort((a, b) => a - b).map((i) => i / HEAT_BUCKETS);
}

function loadWatchRows(db: Database.Database, videoId: number) {
  return db
    .prepare(
      `SELECT user_id, duration, heat FROM watch_events
       WHERE video_id = ? AND heat IS NOT NULL`,
    )
    .all(videoId) as WatchHeatRow[];
}

function loadSceneCurve(db: Database.Database, videoId: number) {
  const row = db
    .prepare("SELECT scene FROM video_heat WHERE video_id = ?")
    .get(videoId) as { scene: Buffer | null } | undefined;
  return decodeCurve(row?.scene ?? null);
}

/** Both curves for the player. A flat watch curve is left out. */
export function loadHeat(db: Database.Database, videoId: number): Heat {
  const { curve } = watchCurve(loadWatchRows(db, videoId));
  const scene = loadSceneCurve(db, videoId);
  return {
    watch: curve && !isFlat(curve) ? curve : null,
    scene: scene && Math.max(...scene) > 0 ? scene : null,
  };
}

/** Recomputes the points a card's preview visits, after either curve moved. */
export function refreshPreviewPoints(db: Database.Database, videoId: number) {
  const watch = watchCurve(loadWatchRows(db, videoId));
  const scene = loadSceneCurve(db, videoId);
  const points =
    (watch.curve && watch.viewers >= WATCH_PREVIEW_VIEWERS
      ? previewPoints(watch.curve)
      : null) ?? (scene ? previewPoints(scene) : null);
  db.prepare("UPDATE videos SET preview_points = ? WHERE id = ?").run(
    points ? points.map((point) => point.toFixed(2)).join(",") : null,
    videoId,
  );
}

/** How the scene curve was measured. */
export type SceneMethod = "keyframes" | "frames";

/**
 * Stores a scene curve, or records that the video could not be analyzed so it
 * is not tried again. A curve from every frame is never replaced by one from
 * keyframes only.
 */
export function saveSceneCurve(
  db: Database.Database,
  videoId: number,
  curve: number[] | null,
  method: SceneMethod,
  now = Date.now(),
) {
  db.prepare(
    `INSERT INTO video_heat (video_id, scene, scene_method, scene_at)
     SELECT id, @scene, @method, @now FROM videos WHERE id = @videoId
     ON CONFLICT(video_id) DO UPDATE SET
       scene = excluded.scene,
       scene_method = excluded.scene_method,
       scene_at = excluded.scene_at
     WHERE NOT (video_heat.scene_method = 'frames'
       AND video_heat.scene IS NOT NULL AND excluded.scene_method = 'keyframes')`,
  ).run({
    videoId,
    scene: curve ? encodeCurve(curve) : null,
    method,
    now,
  });
  refreshPreviewPoints(db, videoId);
}

/** Turns raw scene scores into the stored curve. */
export function saveSceneScores(
  db: Database.Database,
  videoId: number,
  scored: ReadonlyArray<readonly [number, number]>,
  span: number,
  method: SceneMethod = "frames",
) {
  saveSceneCurve(db, videoId, sceneCurve(scored, span), method);
}
