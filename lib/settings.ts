
// Frame-extraction settings, editable from the settings page.
//
// Pure types, defaults and validation — no database import, so the settings
// page can share these constants with the server. Persistence lives in
// lib/settingsStore.ts.

/**
 * How the frames handed to the model are chosen.
 *
 * "scene" decodes the whole file to score every frame for visual change, then
 * takes the most distinct frame from each segment. It picks better frames and
 * costs a full decode pass — roughly 1 second per 45 seconds of footage.
 *
 * "fixed" seeks straight to evenly spaced timestamps. Extraction becomes
 * near-instant because nothing is decoded but the frames themselves, at the
 * cost of landing on whatever happens to be at that moment.
 */
export type FrameStrategy = "scene" | "fixed";

export type TagSettings = {
  strategy: FrameStrategy;
  /** Frames per video, or null to scale with duration (2/4/6/8). */
  frameCount: number | null;
  /** Width the frames are scaled to before being sent to the model. */
  frameWidth: number;
};

export const DEFAULT_SETTINGS: TagSettings = {
  strategy: "scene",
  frameCount: null,
  frameWidth: 512,
};

export const FRAME_COUNT_RANGE = [1, 12] as const;
/** Widths the model handles sensibly; below this detail stops being legible. */
export const FRAME_WIDTHS = [256, 384, 512, 768] as const;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Coerces anything stored or posted into a usable settings object. */
export function normalizeTagSettings(
  raw: Partial<Record<keyof TagSettings, unknown>>,
): TagSettings {
  const strategy: FrameStrategy = raw.strategy === "fixed" ? "fixed" : "scene";

  let frameCount: number | null = null;
  if (typeof raw.frameCount === "number" && Number.isFinite(raw.frameCount)) {
    frameCount = clamp(Math.round(raw.frameCount), ...FRAME_COUNT_RANGE);
  }

  const width = Number(raw.frameWidth);
  // Snap to a known width instead of trusting a free-form number: odd widths
  // interact badly with the model's image tiling.
  const frameWidth = FRAME_WIDTHS.includes(
    width as (typeof FRAME_WIDTHS)[number],
  )
    ? width
    : DEFAULT_SETTINGS.frameWidth;

  return { strategy, frameCount, frameWidth };
}


/**
 * Where the OpenAI-compatible model server lives and which model to call.
 *
 * Any server implementing `GET {url}/models` and `POST {url}/chat/completions`
 * works; the product does not assume a particular vendor.
 */
export type LlmSettings = {
  /** Base URL including the version segment, for example `.../v1`. */
  url: string;
  model: string;
};

/** Trailing slashes are dropped so `${url}/models` never doubles up. */
function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeLlmSettings(
  raw: Record<string, unknown>,
  fallback: LlmSettings,
): LlmSettings {
  const model = typeof raw.llmModel === "string" ? raw.llmModel.trim() : "";
  return {
    url: cleanUrl(raw.llmUrl) ?? fallback.url,
    model: model.length > 0 ? model : fallback.model,
  };
}
