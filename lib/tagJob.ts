import { AppError, errorDetails, type ErrorDetails } from "@/lib/appError";
// In-process batch tagging job. The route schedules its runner with Next.js
// after(), while this module owns state and pushes updates to SSE subscribers.
import db from "./db";
import { createTracker, type BatchProgress } from "./progress";
import { getTagSettings, getLlmSettings } from "./settingsStore";
import {
  getAllManualTags,
  getManualTags,
  getRejectedTags,
  upsertVideoTags,
} from "./tags";
import { buildPrompt, describeFrames, extractFrames } from "./vision";

export type JobLogEntry = {
  key:
    | "started"
    | "frames"
    | "skipped"
    | "tagged"
    | "videoFailed"
    | "finished"
    | "stopped"
    | "failed";
  values?: Record<string, string | number>;
  error?: ErrorDetails;
};

export type JobState = {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  log: (JobLogEntry | string)[];
  /** The video currently being processed, while a job is running. */
  current: BatchProgress | null;
  /**
   * Lines produced since this run began, counting those the cap has since
   * dropped. A client compares it against what it holds to tell whether it
   * missed anything while disconnected.
   */
  logSeq: number;
};

/** Everything but the log, which travels separately and incrementally. */
export type JobStatus = Omit<JobState, "log">;

export type JobEvent =
  | { kind: "snapshot"; state: JobState }
  | { kind: "log"; lines: JobLogEntry[]; logSeq: number }
  | { kind: "status"; status: JobStatus };

type Listener = (event: JobEvent) => void;
type JobRunner = () => Promise<void>;

export type StartTagJobResult =
  | { ok: false; error: string; errorCode: "jobRunning" }
  | { ok: true; run: JobRunner };

const MAX_LOG_LINES = 200;
const EMIT_INTERVAL_MS = 500;

function emptyState(): JobState {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    log: [],
    current: null,
    logSeq: 0,
  };
}

// Module-level singleton: one tagging job per server process. Keeping it on
// globalThis also preserves a running job across development hot reloads.
const g = globalThis as unknown as {
  __tagJob?: {
    controller?: AbortController | null;
    state: JobState;
    listeners?: Set<Listener>;
  };
};

if (!g.__tagJob) {
  g.__tagJob = {
    controller: null,
    state: emptyState(),
    listeners: new Set(),
  };
}

const job = g.__tagJob;
// A hot reload can retain an object created by the former child-process
// implementation, before these fields existed.
if (job.controller === undefined) job.controller = null;
if (!job.listeners) job.listeners = new Set();
if (typeof job.state.logSeq !== "number") {
  job.state.logSeq = job.state.log.length;
}
const listeners = job.listeners;

export function getJobState(): JobState {
  return job.state;
}

function statusOf(): JobStatus {
  return {
    running: job.state.running,
    startedAt: job.state.startedAt,
    finishedAt: job.state.finishedAt,
    exitCode: job.state.exitCode,
    current: job.state.current,
    logSeq: job.state.logSeq,
  };
}

function emit(event: JobEvent) {
  for (const listener of listeners) listener(event);
}

function emitStatus() {
  emit({ kind: "status", status: statusOf() });
}

function appendLog(...lines: JobLogEntry[]) {
  const visible = lines.filter(Boolean);
  if (visible.length === 0) return;
  job.state.log.push(...visible);
  job.state.logSeq += visible.length;
  if (job.state.log.length > MAX_LOG_LINES) {
    job.state.log = job.state.log.slice(-MAX_LOG_LINES);
  }
  emit({ kind: "log", lines: visible, logSeq: job.state.logSeq });
}

/**
 * Registers a listener for job events. The current state is *not* replayed
 * here: read it with `getJobState` first, so the caller decides what a fresh
 * connection is sent.
 */
export function subscribeJob(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function runBatchTagJob(
  force: boolean,
  signal: AbortSignal,
  uiLocale?: string,
) {
  signal.throwIfAborted();
  const already = force
    ? ""
    : `AND id NOT IN (SELECT video_id FROM video_tags WHERE status = 'active')`;
  const rows = db
    .prepare(
      `SELECT id, path, title, duration_sec FROM videos
       WHERE duration_sec IS NOT NULL ${already}
       ORDER BY id`,
    )
    .all() as {
    id: number;
    path: string;
    title: string;
    duration_sec: number;
  }[];

  // Read these once so editing settings or tags mid-run cannot make the first
  // and second halves of one batch incomparable.
  const settings = getTagSettings();
  const libraryTags = getAllManualTags(db);
  const llm = getLlmSettings();
  appendLog(
    {
      key: "started",
      values: { count: rows.length, model: llm.model, endpoint: llm.url },
    },
    {
      key: "frames",
      values: {
        strategy: settings.strategy,
        count: String(settings.frameCount ?? "automatic"),
        width: settings.frameWidth,
      },
    },
  );
  signal.throwIfAborted();

  const totalSec = rows.reduce((sum, row) => sum + row.duration_sec, 0);
  const runStartedAt = Date.now();
  let processedSec = 0;
  let ok = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    signal.throwIfAborted();
    const tracker = createTracker(row.duration_sec, settings.strategy);

    const publishProgress = () => {
      if (signal.aborted) return;
      const snapshot = tracker.snapshot();
      const elapsed = (Date.now() - runStartedAt) / 1000;
      const doneSec = processedSec + row.duration_sec * snapshot.ratio;
      job.state.current = {
        index: index + 1,
        total: rows.length,
        videoId: row.id,
        title: row.title,
        ...snapshot,
        overallEtaSec:
          processedSec > 0 && doneSec > 0
            ? Math.round((elapsed / doneSec) * (totalSec - doneSec))
            : null,
      };
      emitStatus();
    };

    publishProgress();
    const ticker = setInterval(publishProgress, EMIT_INTERVAL_MS);

    try {
      const frames = await extractFrames(
        row.path,
        row.duration_sec,
        (update) => tracker.update(update),
        settings,
        signal,
      );
      signal.throwIfAborted();
      if (frames.length === 0) {
        appendLog({
          key: "skipped",
          values: { index: index + 1, total: rows.length, id: row.id },
        });
        continue;
      }

      tracker.update({ phase: "infer", ratio: 1, frames: frames.length });
      publishProgress();
      const prompt = buildPrompt(
        getManualTags(db, row.id),
        getRejectedTags(db, row.id),
        libraryTags,
        { language: settings.tagLanguage, title: row.title, uiLocale },
      );
      const tags = await describeFrames(frames, prompt, signal);
      signal.throwIfAborted();
      upsertVideoTags(db, row.id, tags, "vision");
      ok++;
      appendLog({
        key: "tagged",
        values: {
          index: index + 1,
          total: rows.length,
          id: row.id,
          tags: tags.join(", "),
        },
      });
    } catch (cause) {
      if (signal.aborted) throw cause;
      failed++;
      appendLog({
        key: "videoFailed",
        error: errorDetails(cause),
        values: {
          index: index + 1,
          total: rows.length,
          id: row.id,
        },
      });
    } finally {
      clearInterval(ticker);
      processedSec += row.duration_sec;
    }
  }

  appendLog({ key: "finished", values: { succeeded: ok, failed } });
}

export function startTagJob(
  force: boolean,
  uiLocale?: string,
): StartTagJobResult {
  if (job.state.running) {
    return {
      ok: false,
      error: new AppError("jobRunning").message,
      errorCode: "jobRunning",
    };
  }

  const controller = new AbortController();
  job.controller = controller;
  job.state = { ...emptyState(), running: true, startedAt: Date.now() };
  emit({ kind: "snapshot", state: job.state });

  return {
    ok: true,
    run: async () => {
      let exitCode: number | null = 0;
      try {
        await runBatchTagJob(force, controller.signal, uiLocale);
      } catch (cause) {
        if (controller.signal.aborted) {
          exitCode = null;
          appendLog({ key: "stopped" });
        } else {
          exitCode = 1;
          appendLog({
            key: "failed",
            error: errorDetails(cause),
          });
        }
      } finally {
        // Only this runner may finish the state associated with its controller.
        if (job.controller === controller) {
          job.state.running = false;
          job.state.finishedAt = Date.now();
          job.state.exitCode = exitCode;
          job.state.current = null;
          job.controller = null;
          emitStatus();
        }
      }
    },
  };
}

export function stopTagJob(): {
  ok: boolean;
  error?: string;
  errorCode?: "noActiveJob";
} {
  if (!job.state.running || !job.controller) {
    return {
      ok: false,
      error: new AppError("noActiveJob").message,
      errorCode: "noActiveJob",
    };
  }
  job.controller.abort();
  return { ok: true };
}
