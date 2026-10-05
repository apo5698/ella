import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FFMPEG_PATH, PREVIEW_DIR } from "./config";
import db from "./db";
import {
  MONTAGE_MIN_SECONDS,
  previewSegments,
  type PreviewSegment,
} from "./previewSegments";

/**
 * Cuts every video's preview into a small clip of its own, in the background.
 *
 * Played from the original, a preview downloads a stretch of a file that is
 * often a gigabyte at 1080p, and every jump between segments waits on another
 * range request and keyframe. The clip holds the same segments back to back at
 * no more than 720 lines, without sound, so it is a few hundred kilobytes and
 * starts at once. It is also H.264, so a video in a format the browser cannot
 * play, such as AVI, gets a preview too.
 *
 * Paced as lib/sceneHeat.ts is: one video at a time, one thread at the lowest
 * priority, stepping aside while any task runs.
 */

/** The shorter side of a clip, in pixels. A smaller source keeps its size. */
const CLIP_SHORT_SIDE = 720;
const START_DELAY_MS = 30_000;
const BETWEEN_MS = 2_000;
const BUSY_MS = 60_000;
/** How often an exhausted queue is checked for new videos. */
const IDLE_MS = 10 * 60_000;
/** A clip of short segments takes seconds. Longer means ffmpeg is stuck. */
const CUT_TIMEOUT_MS = 5 * 60_000;

/** Where a video's clip is written, whether or not it exists yet. */
export function previewClipPath(videoId: number) {
  return path.join(PREVIEW_DIR, `${videoId}.mp4`);
}

export function removePreviewClip(videoId: number) {
  fs.rmSync(previewClipPath(videoId), { force: true });
}

/** The ffmpeg arguments that cut `segments` of `file` into one clip at `out`. */
export function previewClipArgs(
  file: string,
  out: string,
  segments: PreviewSegment[],
) {
  const side = CLIP_SHORT_SIDE;
  // The shorter side is capped, so a portrait video is held to 720 wide
  // rather than 720 high.
  const scale = `scale='if(gt(iw,ih),-2,min(${side},iw))':'if(gt(iw,ih),min(${side},ih),-2)'`;
  const inputs = segments.flatMap(({ start, length }) => [
    "-ss",
    start.toFixed(2),
    "-t",
    length.toFixed(2),
    "-i",
    file,
  ]);
  // Each input is seeked on its own, which is fast, then the pieces are
  // joined. The same frame rate and pixel format on every piece is what lets
  // concat join them.
  const filters = segments
    .map((_, i) => `[${i}:v]${scale},setsar=1,fps=30,format=yuv420p[v${i}]`)
    .join(";");
  const labels = segments.map((_, i) => `[v${i}]`).join("");
  return [
    "-y",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    ...inputs,
    "-filter_complex",
    `${filters};${labels}concat=n=${segments.length}:v=1:a=0[out]`,
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    // The index goes first, so playback starts before the file has arrived.
    "-movflags",
    "+faststart",
    "-loglevel",
    "error",
    out,
  ];
}

/** Resolves true when the clip was written, false when ffmpeg failed on it. */
function cut(file: string, out: string, segments: PreviewSegment[]) {
  return new Promise<boolean>((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, previewClipArgs(file, out, segments), {
      stdio: "ignore",
    });
    if (proc.pid !== undefined) {
      try {
        os.setPriority(proc.pid, os.constants.priority.PRIORITY_LOW);
      } catch {
        // Already exited, or not permitted: it runs at normal priority.
      }
    }
    const timer = setTimeout(() => proc.kill(), CUT_TIMEOUT_MS);
    proc.on("error", (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

// Held on `process` for the reason given in lib/taskRunner.ts: the
// development server can evaluate this module again under a fresh global.
const g = process as unknown as {
  __previewClips?: {
    started: boolean;
    /** Files missing this run, such as an unmounted volume. Tried next run. */
    missing: Set<number>;
  };
};
g.__previewClips ??= { started: false, missing: new Set() };
const state = g.__previewClips;

type Pending = {
  id: number;
  path: string;
  duration_sec: number | null;
  preview_points: string | null;
};

/**
 * A video with no clip comes first. After those, a montage cut from the
 * fallback points is cut again once the scene curve has chosen real ones.
 * Points that later move with the watch curve leave the clip as it is.
 */
function nextVideo(): Pending | undefined {
  const rows = db
    .prepare(
      `SELECT v.id, v.path, v.duration_sec, v.preview_points FROM videos v
       LEFT JOIN video_previews p ON p.video_id = v.id
       WHERE p.video_id IS NULL
          OR (p.ok = 1 AND p.points IS NULL AND v.preview_points IS NOT NULL
              AND v.duration_sec >= ${MONTAGE_MIN_SECONDS})
       ORDER BY p.video_id IS NULL DESC, v.views DESC, v.mtime DESC
       LIMIT ?`,
    )
    .all(state.missing.size + 1) as Pending[];
  return rows.find((row) => !state.missing.has(row.id));
}

function taskRunning() {
  return (
    db
      .prepare("SELECT 1 FROM background_jobs WHERE status = 'running' LIMIT 1")
      .get() !== undefined
  );
}

/** Returns false when ffmpeg itself is missing, which ends the worker. */
async function makeClip(video: Pending) {
  if (!fs.existsSync(video.path)) {
    state.missing.add(video.id);
    return true;
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const out = previewClipPath(video.id);
  // Written aside and moved into place, so a request never reads half a clip.
  const partial = path.join(PREVIEW_DIR, `${video.id}.part.mp4`);
  let ok = false;
  try {
    ok = await cut(
      video.path,
      partial,
      previewSegments(video.duration_sec, video.preview_points),
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
  }
  if (ok) fs.renameSync(partial, out);
  else {
    fs.rmSync(partial, { force: true });
    // A clip from an earlier cut would otherwise outlive the row that names it.
    fs.rmSync(out, { force: true });
  }

  db.prepare(
    `INSERT INTO video_previews (video_id, points, ok, made_at)
     SELECT id, @points, @ok, @now FROM videos WHERE id = @id
     ON CONFLICT(video_id) DO UPDATE SET
       points = excluded.points, ok = excluded.ok, made_at = excluded.made_at`,
  ).run({
    id: video.id,
    points: video.preview_points,
    ok: ok ? 1 : 0,
    now: Date.now(),
  });
  return true;
}

async function run() {
  for (;;) {
    let wait = BETWEEN_MS;
    try {
      const video = taskRunning() ? "busy" : nextVideo();
      if (video === "busy") wait = BUSY_MS;
      else if (!video) wait = IDLE_MS;
      else if (!(await makeClip(video))) {
        console.warn("[preview] ffmpeg is unavailable; preview clips are off");
        return;
      }
    } catch (cause) {
      console.error("[preview] Clip cutting stopped for a while", cause);
      wait = IDLE_MS;
    }
    await new Promise((resolve) => setTimeout(resolve, wait).unref());
  }
}

/** Starts the worker once per process. */
export function startPreviewClipWorker() {
  if (state.started) return;
  state.started = true;
  setTimeout(() => void run(), START_DELAY_MS).unref();
}
