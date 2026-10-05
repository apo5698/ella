/**
 * Which parts of a video its preview shows. Shared by the clip the server cuts
 * (lib/previewClips.ts) and the player that falls back to the full file when
 * no clip exists yet (components/video/useVideoPreview.ts), so both show the
 * same thing. No server import, so the browser can load it.
 */

/**
 * Points across the video the preview visits, as fractions of its length,
 * when its heat curves have not chosen any (lib/heat.ts).
 */
export const FALLBACK_POINTS = [0.12, 0.3, 0.48, 0.66, 0.84];
export const SEGMENT_SECONDS = 2.5;
/** Shorter videos play straight through instead of in segments. */
export const MONTAGE_MIN_SECONDS = 45;

/** Reads videos.preview_points, falling back to the fixed points. */
export function previewPointsOf(points: string | null) {
  const parsed = points
    ?.split(",")
    .map(Number)
    .filter((point) => point >= 0 && point < 1);
  return parsed?.length ? parsed : FALLBACK_POINTS;
}

/** One stretch of the source: where it starts and how long it runs, in seconds. */
export type PreviewSegment = { start: number; length: number };

/**
 * The stretches a clip is cut from. A video long enough for a montage gives
 * one segment per point; a shorter one plays whole. A video of unknown length
 * gives its opening, which is all that can be placed without one.
 */
export function previewSegments(
  duration: number | null,
  points: string | null,
): PreviewSegment[] {
  if (!duration || duration <= 0)
    return [{ start: 0, length: SEGMENT_SECONDS * FALLBACK_POINTS.length }];
  if (duration < MONTAGE_MIN_SECONDS) return [{ start: 0, length: duration }];
  return previewPointsOf(points).map((point) => ({
    start: Math.min(point * duration, duration - SEGMENT_SECONDS),
    length: SEGMENT_SECONDS,
  }));
}

/**
 * Where in the whole video a moment of the clip comes from, as a fraction of
 * its length, so the progress line under a playing clip shows the real place.
 */
export function clipPosition(
  segments: PreviewSegment[],
  clipTime: number,
  duration: number,
) {
  let rest = clipTime;
  for (const segment of segments) {
    if (rest < segment.length)
      return Math.min(1, (segment.start + rest) / duration);
    rest -= segment.length;
  }
  const last = segments[segments.length - 1];
  return Math.min(1, (last.start + last.length) / duration);
}
