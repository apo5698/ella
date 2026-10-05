import fs from "node:fs";
import db from "./db";
import { saveSceneScores } from "./heat";
import { scoreScenes } from "./vision";

/**
 * Measures the scene curve of every video that lacks one, in the background.
 *
 * Ella often runs on a Raspberry Pi with a modest power supply, so the pass
 * decodes keyframes only, on one thread at the lowest priority, one video at a
 * time, and steps aside while any task runs. A video tagged with the "scene"
 * strategy already has a finer curve from that pass and is skipped.
 */

/** Lets the server finish starting before the first video. */
const START_DELAY_MS = 60_000;
const BETWEEN_MS = 5_000;
const BUSY_MS = 60_000;
/** How often an exhausted queue is checked for new videos. */
const IDLE_MS = 10 * 60_000;

// Held on `process` for the reason given in lib/taskRunner.ts: the
// development server can evaluate this module again under a fresh global.
const g = process as unknown as {
  __sceneHeat?: {
    started: boolean;
    /** Files missing this run, such as an unmounted volume. Tried next run. */
    missing: Set<number>;
  };
};
g.__sceneHeat ??= { started: false, missing: new Set() };
const state = g.__sceneHeat;

type Pending = { id: number; path: string; duration_sec: number | null };

function nextVideo(): Pending | undefined {
  const rows = db
    .prepare(
      `SELECT v.id, v.path, v.duration_sec FROM videos v
       WHERE NOT EXISTS (SELECT 1 FROM video_heat h WHERE h.video_id = v.id)
       ORDER BY v.views DESC, v.mtime DESC
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
async function analyze(video: Pending) {
  if (!fs.existsSync(video.path)) {
    state.missing.add(video.id);
    return true;
  }
  let scored: Array<[number, number]> = [];
  try {
    scored = await scoreScenes(
      video.path,
      undefined,
      video.duration_sec,
      undefined,
      { keyframesOnly: true, background: true },
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    // A file ffmpeg cannot read is stored without a curve, and not retried.
  }
  const observed = scored.reduce((max, [time]) => Math.max(max, time), 0);
  saveSceneScores(
    db,
    video.id,
    scored,
    observed > 1 ? observed : (video.duration_sec ?? 0),
    "keyframes",
  );
  return true;
}

async function run() {
  for (;;) {
    let wait = BETWEEN_MS;
    try {
      const video = taskRunning() ? "busy" : nextVideo();
      if (video === "busy") wait = BUSY_MS;
      else if (!video) wait = IDLE_MS;
      else if (!(await analyze(video))) {
        console.warn("[heat] ffmpeg is unavailable; scene curves are off");
        return;
      }
    } catch (cause) {
      console.error("[heat] Scene analysis stopped for a while", cause);
      wait = IDLE_MS;
    }
    await new Promise((resolve) => setTimeout(resolve, wait).unref());
  }
}

/** Starts the worker once per process. */
export function startSceneHeatWorker() {
  if (state.started) return;
  state.started = true;
  setTimeout(() => void run(), START_DELAY_MS).unref();
}
