// Shared progress model for a single video's tagging run, used by both the
// per-video API job and the batch job so the two report identical numbers.
import type { ProgressUpdate, TagPhase } from "./vision";
import type { FrameStrategy } from "./settings";

export type PhaseProgress = {
  phase: TagPhase;
  /** Overall completion across extraction and inference, 0-1. */
  ratio: number;
  /** Seconds left overall. Null while the estimate is still too noisy. */
  etaSec: number | null;
};

export type BatchProgress = PhaseProgress & {
  /** 1-based position in this run's queue. */
  index: number;
  total: number;
  videoId: number;
  title: string;
  /** Seconds left for the whole run. Null until one video has finished. */
  overallEtaSec: number | null;
};

// Initial decode-rate estimate, refined from observed progress.
export const ASSUMED_DECODE_RATE = 45;

// Decode-rate bounds for preliminary duration estimates.
export const DECODE_RATE_RANGE = [28, 135] as const;
// Linear inference-time estimate based on frame count.
const INFER_BASE_SEC = 1.5;
const INFER_PER_FRAME_SEC = 1.1;
const DEFAULT_FRAMES = 6;

/**
 * Blends the two phases into one 0-1 figure. Extraction is measured; inference
 * is a single opaque request, so its share is time-estimated from the frame
 * count. Weighting each phase by its expected duration keeps the bar moving at
 * a roughly even rate instead of stalling at the hand-off.
 */
export function createTracker(
  durationSec: number | null,
  strategy: FrameStrategy = "scene",
) {
  const startedAt = Date.now();
  let phase: TagPhase = "extract";
  let extractRatio = 0;
  // Only scene detection scales with the length of the video, because only it
  // decodes the whole thing. Seeking to fixed timestamps costs the same
  // handful of seconds whether the file runs two minutes or two hours, so it
  // starts from a small figure and lets the first frame correct it.
  let extractEst =
    strategy === "scene"
      ? Math.max(0.5, (durationSec ?? 0) / ASSUMED_DECODE_RATE)
      : 0.5;
  let extractActual: number | null = null;
  let inferStartedAt: number | null = null;
  let inferEst = INFER_BASE_SEC + INFER_PER_FRAME_SEC * DEFAULT_FRAMES;

  return {
    startedAt,

    update(update: ProgressUpdate) {
      phase = update.phase;
      if (update.phase === "extract") {
        extractRatio = update.ratio;
        // Refine the estimate from observed decode throughput.
        if (update.ratio > 0.03) {
          extractEst = (Date.now() - startedAt) / 1000 / update.ratio;
        }
      } else {
        extractActual = (Date.now() - startedAt) / 1000;
        inferStartedAt = Date.now();
        if (update.frames) {
          inferEst = INFER_BASE_SEC + INFER_PER_FRAME_SEC * update.frames;
        }
      }
    },

    snapshot(): PhaseProgress {
      const extractTotal = extractActual ?? extractEst;
      const total = extractTotal + inferEst;

      let done: number;
      if (phase === "extract") {
        done = extractRatio * extractTotal;
      } else {
        const inferElapsed =
          (Date.now() - (inferStartedAt ?? Date.now())) / 1000;
        done = extractTotal + Math.min(inferElapsed, inferEst);
      }

      // Never let an estimate claim completion; only the real result does that.
      const ratio = Math.min(0.99, total > 0 ? done / total : 0);
      // The first few percent of the decode extrapolate badly, so withhold the
      // number until the pass is properly under way.
      const settled = phase === "infer" || extractRatio > 0.03;
      return {
        phase,
        ratio,
        etaSec: settled ? Math.max(0, Math.round(total - done)) : null,
      };
    },
  };
}
