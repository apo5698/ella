/**
 * Rules the player and the server must agree on, kept free of server imports
 * so the page can load them too.
 */

/**
 * Seconds of actual playback, skipped parts excluded, after which a sitting
 * counts as a view. Below it the viewer left at once, which recommendations
 * read as a bounce (docs/recommendations.md).
 */
export function viewThreshold(duration: number | null) {
  return duration && duration > 0 ? Math.min(20, duration * 0.3) : 20;
}

/** Equal parts every video is divided into for its heat curves. */
export const HEAT_BUCKETS = 100;

/** The bucket a moment of playback falls in. */
export function heatBucket(time: number, duration: number) {
  return Math.min(
    HEAT_BUCKETS - 1,
    Math.max(0, Math.floor((time / duration) * HEAT_BUCKETS)),
  );
}
