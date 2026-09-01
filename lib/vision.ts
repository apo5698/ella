// Frame extraction + local vision-LLM tagging. Nothing leaves the machine:
// frames go to the model server configured on the settings page.
//
// Shared by the in-process batch job and the per-video re-tag API route, so
// both use identical extraction and prompting.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import db from "./db";
import { FFMPEG_PATH } from "./config";
import {
  upsertVideoTags,
  getManualTags,
  getRejectedTags,
  getAllManualTags,
} from "./tags";
import type { TagSettings } from "./settings";
import { getTagSettings, getLlmSettings } from "./settingsStore";

// Read per call rather than captured at import: the address and model are
// editable from the settings page, and a running server must pick up a change
// without a restart.
const SCORE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Tagging runs in two phases. "extract" is measurable — it is a decode pass
 * over a file of known length — and reports a 0-1 ratio many times per second.
 * "infer" is a single request to the model server with no intermediate signal, so it
 * only ever reports ratio 1 and callers should show it as indeterminate.
 */
export type TagPhase = "extract" | "infer";
export type ProgressUpdate = {
  phase: TagPhase;
  /** Position within the current phase, 0-1. Always 1 for "infer". */
  ratio: number;
  /** Frames handed to the model. Only present on the first "infer" update. */
  frames?: number;
};
export type ProgressFn = (update: ProgressUpdate) => void;

const BASE_PROMPT = `请只根据画面中【可见】的内容，为这段视频生成 6-10 个中文检索标签，用逗号分隔。
只描述客观可见信息：人物发型/发色、服装/配饰的颜色材质、场景/环境、明显道具、姿势动作类型。
不要输出完整句子、不要输出解释、不要输出问候语，只输出逗号分隔的标签列表。`;

/**
 * Folds the user's own corrections into the prompt: their manual tags are
 * stated as confirmed facts (so the model reuses that vocabulary instead of
 * inventing a synonym), and tags they previously removed are listed as
 * forbidden output.
 *
 * `libraryTags` is every tag the user has added by hand anywhere, and is the
 * only part of the prompt that is not about this one video. A model left to
 * itself reaches for general language and never produces a term it was not
 * given, so a library whose useful words are domain-specific has to hand them
 * over. It is stated as a preference rather than a closed set: the model must
 * still be able to describe something the list has no word for.
 */
export function buildPrompt(
  manualTags: string[],
  rejectedTags: string[],
  libraryTags: string[] = [],
): string {
  let prompt = BASE_PROMPT;
  if (libraryTags.length > 0) {
    prompt += `\n\n下列词汇是本标签库已有的用词。画面中确实出现对应内容时，请直接使用这些词，不要改写成近义词；画面中没有的内容不要输出，本列表不限制你描述其他可见细节：${libraryTags.join("、")}。`;
  }
  if (manualTags.length > 0) {
    prompt += `\n\n以下标签由用户人工确认，是准确的，请优先沿用这些用词，并围绕它们补充其他可见细节：${manualTags.join("、")}。`;
  }
  if (rejectedTags.length > 0) {
    prompt += `\n\n以下标签此前被用户判定为不适用于本视频，绝对不要输出它们，也不要输出它们的近义词：${rejectedTags.join("、")}。`;
  }
  return prompt;
}

// Some files have container metadata (duration) that outlives the actual
// decodable video stream (broken tail from a bad download/encode). If the
// primary seek point yields no frame, fall back to earlier points in the
// same file before giving up on that slot.
function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

function grabFrame(
  file: string,
  tmpDir: string,
  slot: number,
  seekSec: number,
  width: number,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted();
  const outPath = path.join(tmpDir, `f${slot}.jpg`);
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      FFMPEG_PATH,
      [
        "-y",
        "-ss",
        Math.max(0, seekSec).toFixed(2),
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        `scale=${width}:-2`,
        "-q:v",
        "4",
        "-strict",
        "unofficial",
        "-loglevel",
        "error",
        outPath,
      ],
      { stdio: "ignore" },
    );
    let settled = false;
    const abort = () => proc.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });

    const finish = (value: string | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else resolve(value);
    };

    proc.on("error", () => {
      if (signal?.aborted) finish(null, abortReason(signal));
      else finish(null);
    });
    proc.on("close", (code) => {
      if (signal?.aborted) {
        finish(null, abortReason(signal));
        return;
      }
      try {
        finish(
          code === 0 && fs.existsSync(outPath)
            ? fs.readFileSync(outPath).toString("base64")
            : null,
        );
      } catch {
        finish(null);
      }
    });
  });
}

// Fixed-fraction fallback: used only when scene detection finds nothing
// (e.g. a near-static clip, or a file ffmpeg can't fully decode).
async function extractFixedFrames(
  file: string,
  durationSec: number | null,
  count: number,
  width: number,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-frame-"));
  const dur = durationSec && durationSec > 1 ? durationSec : 6;
  const fractions =
    count === 1
      ? [0.35]
      : Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
  const out: string[] = [];
  try {
    for (const [i, frac] of fractions.entries()) {
      signal?.throwIfAborted();
      const primary = Math.max(0.5, dur * frac);
      const fallbacks = [primary, primary * 0.5, primary * 0.2, 5].filter(
        (t) => t >= 0.5,
      );
      for (const t of fallbacks) {
        signal?.throwIfAborted();
        const frame = await grabFrame(file, tmpDir, i, t, width, signal);
        if (frame) {
          out.push(frame);
          break;
        }
      }
      // Nothing is decoded end to end here, so the only honest measure of
      // progress is how many of the wanted frames are already in hand.
      onProgress?.({ phase: "extract", ratio: (i + 1) / fractions.length });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return out;
}

// How many frames a video is "worth" tagging with.
export function frameBudget(durationSec: number | null): number {
  const dur = durationSec ?? 0;
  if (dur <= 30) return 2;
  if (dur <= 300) return 4;
  if (dur <= 1800) return 6;
  return 8;
}

/**
 * Decodes the whole file once and reports ffmpeg's per-frame scene-change
 * score as [pts_time, score] pairs. Nothing is encoded — the output is
 * discarded — so the cost is a plain decode pass, about 30-55x realtime.
 *
 * This replaces an earlier `select='gt(scene,0.35)'` filter that wrote out
 * matching frames directly. That threshold never fired on this library: a
 * 26-minute sample peaked at 0.0545 across 19240 frames (mean 0.0021),
 * because the footage is continuous single-camera with no hard cuts. The
 * pass ran, selected nothing, and silently fell back to fixed timestamps.
 * Scoring every frame and ranking them avoids depending on any threshold.
 */
function scoreScenes(
  file: string,
  onProgress?: ProgressFn,
  durationSec?: number | null,
  signal?: AbortSignal,
) {
  return new Promise<Array<[number, number]>>((resolve, reject) => {
    signal?.throwIfAborted();
    const proc = spawn(FFMPEG_PATH, [
      "-y",
      "-i",
      file,
      "-vf",
      "scale=256:-2,select='gt(scene\\,0)',metadata=print:file=-",
      "-fps_mode",
      "vfr",
      "-an",
      "-f",
      "null",
      "-",
      "-strict",
      "unofficial",
      "-loglevel",
      "error",
      "-nostats",
    ]);

    const scored: Array<[number, number]> = [];
    const timer = setTimeout(() => proc.kill(), SCORE_TIMEOUT_MS);
    const abort = () => proc.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    let buf = "";
    let pendingTime: number | null = null;
    let settled = false;

    const finish = (
      result:
        | { ok: true; value: Array<[number, number]> }
        | { ok: false; error: unknown },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };

    // metadata=print emits two lines per frame: the frame header carrying
    // pts_time, then the score. The header alone also drives the progress
    // callback, so progress advances even on stretches with no scoring.
    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        const head = line.match(/^frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)/);
        if (head) {
          pendingTime = Number(head[1]);
          if (onProgress && durationSec) {
            onProgress({
              phase: "extract",
              ratio: Math.min(1, pendingTime / durationSec),
            });
          }
          continue;
        }
        const score = line.match(/^lavfi\.scene_score=([\d.]+)/);
        if (score && pendingTime !== null) {
          scored.push([pendingTime, Number(score[1])]);
          pendingTime = null;
        }
      }
    });

    proc.on("error", (err) => {
      finish({ ok: false, error: err });
    });
    proc.on("close", () => {
      if (signal?.aborted) {
        finish({
          ok: false,
          error: abortReason(signal),
        });
      } else {
        finish({ ok: true, value: scored });
      }
    });
  });
}

/**
 * Splits the video into `count` equal segments and takes the highest-scoring
 * frame from each. Segment-local rather than global ranking: a global top-N
 * clusters on whatever stretch happens to have the most motion and can skip
 * whole halves of a video, while this keeps coverage and still lands on the
 * most distinct moment within each part. The outer 2% is skipped to avoid
 * leaders and black tails.
 */
function pickStratified(
  scored: Array<[number, number]>,
  count: number,
  spanSec: number,
): number[] {
  const lo = spanSec * 0.02;
  const width = (spanSec * 0.96) / count;
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = lo + i * width;
    const to = from + width;
    let best: [number, number] | null = null;
    for (const entry of scored) {
      if (entry[0] >= from && entry[0] < to && (!best || entry[1] > best[1]))
        best = entry;
    }
    if (best) times.push(best[0]);
  }
  return times;
}

async function grabAt(
  file: string,
  times: number[],
  width: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-scene-"));
  try {
    const out: string[] = [];
    for (const [i, t] of times.entries()) {
      signal?.throwIfAborted();
      const frame = await grabFrame(file, tmpDir, i, t, width, signal);
      if (frame) out.push(frame);
    }
    return out;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function extractFrames(
  file: string,
  durationSec: number | null,
  onProgress?: ProgressFn,
  settings: TagSettings = getTagSettings(),
  signal?: AbortSignal,
): Promise<string[]> {
  const maxFrames = settings.frameCount ?? frameBudget(durationSec);
  const width = settings.frameWidth;

  // "fixed" skips the scoring pass entirely. That pass is the whole cost of
  // extraction — it decodes the file end to end — so this is the difference
  // between seconds per video and a fraction of one.
  if (settings.strategy === "scene") {
    let scored: Array<[number, number]> = [];
    try {
      scored = await scoreScenes(file, onProgress, durationSec, signal);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      // ffmpeg missing or unable to open the file: fall through to seek-and-grab.
    }

    if (scored.length > 0) {
      // Trust the timestamps actually decoded over the container's duration:
      // some files claim a length that outlives their usable video stream.
      const observed = scored.reduce((max, [t]) => (t > max ? t : max), 0);
      const span = observed > 1 ? observed : (durationSec ?? 0);
      const frames = await grabAt(
        file,
        pickStratified(scored, maxFrames, span),
        width,
        signal,
      );
      if (frames.length > 0) return frames;
    }
  }

  return extractFixedFrames(
    file,
    durationSec,
    maxFrames,
    width,
    onProgress,
    signal,
  );
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，、\n]/)
    .map((s) =>
      s
        .trim()
        .replace(/^[#\-\d.\s]+/, "")
        .toLowerCase(),
    )
    .filter((s) => s.length >= 1 && s.length <= 14)
    .slice(0, 12);
}

export async function describeFrames(
  images: string[],
  prompt: string = BASE_PROMPT,
  signal?: AbortSignal,
): Promise<string[]> {
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentPart[] = [{ type: "text", text: prompt }];
  for (const b64 of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    });
  }

  const { url, model } = getLlmSettings();
  const res = await fetch(`${url}/chat/completions`, {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    throw new Error(`模型服务返回 ${res.status}：${await res.text()}`);
  }
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return parseTags(text);
}

/** Recognizes tags without changing the video's stored associations. */
export async function suggestVideoTagsById(
  videoId: number,
  onProgress?: ProgressFn,
): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const row = db
    .prepare("SELECT id, path, duration_sec FROM videos WHERE id = ?")
    .get(videoId) as
    { id: number; path: string; duration_sec: number | null } | undefined;

  if (!row) return { ok: false, error: "视频记录不存在" };
  if (!fs.existsSync(row.path)) return { ok: false, error: "视频文件不存在" };

  const frames = await extractFrames(row.path, row.duration_sec, onProgress);
  if (frames.length === 0) return { ok: false, error: "无法抽取视频画面" };

  const prompt = buildPrompt(
    getManualTags(db, videoId),
    getRejectedTags(db, videoId),
    getAllManualTags(db),
  );
  onProgress?.({ phase: "infer", ratio: 1, frames: frames.length });
  const tags = await describeFrames(frames, prompt);
  return { ok: true, tags };
}

/** Runs recognition and immediately stores its result. */
export async function tagVideoById(
  videoId: number,
  onProgress?: ProgressFn,
): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const result = await suggestVideoTagsById(videoId, onProgress);
  if (!result.ok) return result;
  const tags = result.tags;
  upsertVideoTags(db, videoId, tags, "vision");
  return { ok: true, tags };
}
