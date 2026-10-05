// How long the configured model really takes, so the progress estimate for
// inference follows the hardware rather than a fixed guess. Server-only.
import db from "./db";
import { inferEstimateSec } from "./progress";
import { getLlmSettings } from "./settingsStore";

const KEY = "inferenceTiming";
/** Share of each new measurement in the running figure. */
const WEIGHT = 0.3;
const SCALE_RANGE = [0.2, 50] as const;

type Stored = { model: string; scale: number };

function read(): Stored | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as Partial<Stored>;
    return typeof value.model === "string" &&
      typeof value.scale === "number" &&
      Number.isFinite(value.scale)
      ? { model: value.model, scale: value.scale }
      : null;
  } catch {
    return null;
  }
}

/**
 * How many times the default estimate this model has taken. 1 until it has
 * been measured, and again after the model changes.
 */
export function inferenceScale(): number {
  const stored = read();
  return stored && stored.model === getLlmSettings().model ? stored.scale : 1;
}

/** Folds one completed inference into the running figure. */
export function recordInference(frames: number, seconds: number) {
  if (!(frames > 0) || !(seconds > 0)) return;
  const model = getLlmSettings().model;
  const observed = seconds / inferEstimateSec(frames);
  const stored = read();
  const current = stored && stored.model === model ? stored.scale : observed;
  const scale = Math.min(
    SCALE_RANGE[1],
    Math.max(SCALE_RANGE[0], current + WEIGHT * (observed - current)),
  );
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify({ model, scale }));
}
