import { AppError, errorDetails } from "@/lib/appError";
import type Database from "better-sqlite3";
import db from "./db";
import {
  createJob,
  getJob,
  notifyJobsChanged,
  requeueJob,
  type Job,
  type JobKind,
  type JobPayload,
} from "./jobs";
import {
  createNotification,
  notifyNotificationsChanged,
} from "./notifications";
import { createTracker } from "./progress";
import { scanVideoCatalog } from "./catalogScan";
import { getTagSettings } from "./settingsStore";
import { suggestVideoTagsById } from "./vision";
import { upsertVideoTags } from "./tags";
import { DuplicateContentError } from "./utilities/downloadImport";
import {
  importSelectedFile,
  RetainedDownloadError,
} from "./utilities/downloadInspect";
import { sweepWorkspaces } from "./utilities/downloadWorkspace";
import type {
  DownloadJobFailure,
  DownloadJobPayload,
  DownloadProgressReporter,
  ImportedDownloadResult,
} from "./utilities/downloadTypes";
import type { DownloaderSource } from "./utilities/registry";
import { downloadQinglanhua } from "./utilities/qinglanhua";
import { qinglanhuaDownloadSchema } from "./utilities/qinglanhuaSchema";
import { downloadSykb } from "./utilities/sykb";
import { sykbDownloadSchema } from "./utilities/sykbSchema";

/**
 * The in-process worker behind the task queue.
 *
 * Tasks run oldest first in two lanes. Library work runs one at a time.
 * Downloads spend hours waiting on the network, so they run in a lane of
 * their own that does not hold up tagging, and without a limit: a download
 * waits only when it is parked as `pending`, which is the user's decision.
 * A task's row in `background_jobs` is the
 * source of truth: progress is written there rather than held in memory, so
 * the UI and worker read the same numbers, and a server that restarts mid-task
 * picks the work up again instead of losing it.
 */

/** Rows rewritten per statement. Small enough to stay responsive to a cancel. */
const CHUNK = 200;

/** How often progress reaches the database while a task runs. */
const PROGRESS_MS = 250;

type TaskContext = {
  payload: JobPayload;
  setTotal: (total: number) => void;
  advance: (processed: number) => void;
  /** Detail the count cannot carry. Written with the same throttle. */
  report: (progress: JobPayload) => void;
  canceled: () => boolean;
  /** Aborted on cancel, for work that can be interrupted mid-operation. */
  signal: AbortSignal;
};

/** Returns locale-independent values describing the completed work. */
type TaskHandler = (ctx: TaskContext) => Promise<JobPayload>;

/**
 * Rewrites every remaining generated association of one tag as a manual one.
 *
 * Accepting a generated tag is a statement about the tag, not about the one
 * video it was accepted on: the user has confirmed the word belongs to the
 * library. Left per-video, the same tag would read as the user's own in one
 * place and as a guess in another, which is the "manual and AI" state the row
 * dot had to invent a colour for.
 *
 * Rejections keep their source: they are the model's output that the user
 * turned down, and re-generation still needs to read them that way.
 */
const promoteTagSource: TaskHandler = async ({
  payload,
  setTotal,
  advance,
  canceled,
}) => {
  const tagId = Number(payload.tagId);
  const tag = db.prepare("SELECT name FROM tags WHERE id = ?").get(tagId) as
    { name: string } | undefined;
  if (!tag) throw new AppError("tagMissing");

  const remaining = db.prepare(
    `SELECT COUNT(*) AS c FROM video_tags
     WHERE tag_id = ? AND source = 'vision' AND status = 'active'`,
  );
  const promote = db.prepare(
    `UPDATE video_tags SET source = 'manual'
     WHERE rowid IN (
       SELECT rowid FROM video_tags
       WHERE tag_id = ? AND source = 'vision' AND status = 'active'
       LIMIT ?
     )`,
  );

  setTotal((remaining.get(tagId) as { c: number }).c);

  let done = 0;
  while (!canceled()) {
    const info = promote.run(tagId, CHUNK);
    if (info.changes === 0) break;
    done += info.changes;
    advance(done);
    // Yields the thread between chunks so a long promotion does not hold up
    // the requests the same server is answering.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return { count: done };
};

/** Recognizes one video while reporting its existing two-phase progress. */
const retagVideo: TaskHandler = async ({
  payload,
  setTotal,
  advance,
  canceled,
}) => {
  const videoId = Number(payload.videoId);
  const video = db
    .prepare("SELECT title, duration_sec FROM videos WHERE id = ?")
    .get(videoId) as { title: string; duration_sec: number | null } | undefined;
  if (!video) throw new AppError("videoMissing");

  const tracker = createTracker(video.duration_sec, getTagSettings().strategy);
  setTotal(100);
  const ticker = setInterval(() => {
    advance(Math.min(99, Math.round(tracker.snapshot().ratio * 100)));
  }, PROGRESS_MS);

  try {
    const result = await suggestVideoTagsById(
      videoId,
      (update) => tracker.update(update),
      typeof payload.uiLocale === "string" ? payload.uiLocale : undefined,
    );
    if (!result.ok) throw result.error;
    if (canceled()) return {};

    upsertVideoTags(db, videoId, result.tags, "vision");
    const count = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM video_tags WHERE video_id = ? AND status = 'active'",
        )
        .get(videoId) as { c: number }
    ).c;
    advance(100);
    return { tagCount: count };
  } finally {
    clearInterval(ticker);
  }
};

/** Synchronizes the configured video directory with the catalog. */
const scanCatalog: TaskHandler = async ({ setTotal, advance, canceled }) => {
  let totalInitialized = false;
  const result = await scanVideoCatalog({
    canceled,
    onProgress: ({ processed, total }) => {
      if (!totalInitialized) {
        setTotal(total);
        totalInitialized = true;
      }
      advance(processed);
    },
  });

  return result;
};

type Downloader = (
  input: never,
  onProgress: DownloadProgressReporter,
  signal: AbortSignal,
) => Promise<ImportedDownloadResult>;

const DOWNLOADERS = {
  qinglanhua: {
    schema: qinglanhuaDownloadSchema,
    download: downloadQinglanhua as Downloader,
  },
  sykb: { schema: sykbDownloadSchema, download: downloadSykb as Downloader },
} satisfies Record<
  DownloaderSource,
  { schema: { parse(value: unknown): unknown }; download: Downloader }
>;

/** Downloads one video from its source and adds it to the library. */
const downloadVideo: TaskHandler = async ({ payload, report, signal }) => {
  const { source, input, name, selection, recognize } =
    payload as DownloadJobPayload;
  let result: ImportedDownloadResult;
  if (selection) {
    // A file the user chose from a download kept after a layout mismatch.
    result = await importSelectedFile(name, selection, report);
  } else {
    const downloader = DOWNLOADERS[source];
    if (!downloader) throw new AppError("operationFailed");
    result = await downloader.download(
      downloader.schema.parse(input) as never,
      report,
      signal,
    );
  }
  if (recognize) {
    // The video is in the library by now; a recognition that cannot be
    // queued leaves it there untagged rather than failing the download.
    try {
      enqueueVideoRetag(db, result.videoId, recognize.locale);
    } catch (cause) {
      console.error("[tasks] Unable to queue recognition", cause);
    }
  }
  return result;
};

const HANDLERS: Record<JobKind, TaskHandler> = {
  TAG_APPROVAL: promoteTagSource,
  VIDEO_RETAG: retagVideo,
  VIDEO_CATALOG_SCAN: scanCatalog,
  VIDEO_DOWNLOAD: downloadVideo,
};

/**
 * What a notification keeps of a task. A download's payload holds the share
 * code or password it was started with, and its outcome the whole import
 * report, neither of which belongs in the notification history.
 */
function notificationPayload(job: Job, outcome: JobPayload | null): JobPayload {
  if (job.kind !== "VIDEO_DOWNLOAD")
    return outcome ? { ...job.payload, ...outcome } : job.payload;
  const { source, name } = job.payload as DownloadJobPayload;
  const result = outcome as ImportedDownloadResult | null;
  return result
    ? { source, name, videoId: result.videoId, videoTitle: result.title }
    : { source, name, videoTitle: name };
}

/** Kept on a failed task so its list entry can say what went wrong. */
function failureOutcome(cause: unknown): DownloadJobFailure {
  const retained =
    cause instanceof RetainedDownloadError ? cause.retained : undefined;
  const reason = retained ? (cause as Error).cause : cause;
  return {
    error: errorDetails(cause),
    video: reason instanceof DuplicateContentError ? reason.video : null,
    ...(retained ? { retained } : {}),
  };
}

type Lane = "library" | "download";
const LANE_LIMITS: Record<Lane, number> = {
  library: 1,
  download: Number.POSITIVE_INFINITY,
};

// One worker per server process, held on globalThis so a hot reload in
// development neither starts a second worker against the same table nor
// forgets the tasks the first one is still running.
const g = globalThis as unknown as {
  __taskWorker?: {
    running: Record<Lane, number>;
    active: Map<number, AbortController>;
    recovered: boolean;
    /** Set while the app is being replaced by an update. */
    held?: boolean;
    /** Set until leftover download workspaces have been swept. */
    starting?: boolean;
  };
};
if (!g.__taskWorker)
  g.__taskWorker = {
    running: { library: 0, download: 0 },
    active: new Map(),
    recovered: false,
  };
const worker = g.__taskWorker;

/** Tasks in progress right now. Queued ones have not started any work. */
export function runningTaskCount(): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM background_jobs WHERE status = 'running'",
      )
      .get() as { c: number }
  ).c;
}

/**
 * Stops new tasks from starting while an update replaces this process.
 * Queued tasks stay queued and start in the new version, which is as close
 * to pausing as work that cannot resume mid-transfer gets.
 */
export function holdTaskRunner() {
  worker.held = true;
}

/** Lets queued tasks start again, after an update that did not happen. */
export function releaseTaskRunner() {
  if (!worker.held) return;
  worker.held = false;
  kickTaskRunner();
}

/**
 * Asks a running task to stop. Work that honors the signal stops at once;
 * the rest settles at its next chunk boundary.
 */
export function requestTaskCancel(id: number) {
  worker.active.get(id)?.abort(new AppError("taskCanceled"));
}

function claimNext(lane: Lane): Job | undefined {
  const next = db
    .prepare(
      `SELECT id FROM background_jobs
       WHERE status = 'queued' AND (kind = 'VIDEO_DOWNLOAD') = ?
       ORDER BY id LIMIT 1`,
    )
    .get(lane === "download" ? 1 : 0) as { id: number } | undefined;
  if (!next) return undefined;
  db.prepare(
    `UPDATE background_jobs
     SET status = 'running', started_at = ?, processed = 0, outcome = NULL,
       progress = NULL
     WHERE id = ?`,
  ).run(Date.now(), next.id);
  return getJob(db, next.id);
}

async function runOne(job: Job, controller: AbortController) {
  const handler = HANDLERS[job.kind];
  const finish = db.prepare(
    "UPDATE background_jobs SET status = ?, outcome = ?, progress = NULL, finished_at = ? WHERE id = ?",
  );
  const writeProgress = db.prepare(
    "UPDATE background_jobs SET processed = ?, total = ?, progress = ? WHERE id = ?",
  );

  let total = 0;
  let processed = 0;
  let progress: JobPayload | null = null;
  let lastWrite = 0;
  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_MS) return;
    lastWrite = now;
    writeProgress.run(
      processed,
      total,
      progress && JSON.stringify(progress),
      job.id,
    );
    notifyJobsChanged();
  };
  const canceled = () => controller.signal.aborted;

  notifyJobsChanged();

  try {
    const outcome = await handler({
      payload: job.payload,
      setTotal: (value) => {
        total = value;
        flush(true);
      },
      advance: (value) => {
        processed = value;
        flush(false);
      },
      report: (value) => {
        // A new phase is written at once so a short one is not skipped.
        const force = value.phase !== progress?.phase;
        progress = value;
        flush(force);
      },
      canceled,
      signal: controller.signal,
    });
    flush(true);
    finish.run(
      canceled() ? "canceled" : "succeeded",
      JSON.stringify(outcome),
      Date.now(),
      job.id,
    );
    if (!canceled()) {
      createNotification(db, {
        type: job.kind,
        payload: notificationPayload(job, outcome),
      });
      notifyNotificationsChanged();
    }
  } catch (cause) {
    try {
      if (canceled()) {
        finish.run("canceled", null, Date.now(), job.id);
      } else {
        finish.run(
          "failed",
          JSON.stringify(failureOutcome(cause)),
          Date.now(),
          job.id,
        );
        createNotification(db, {
          type: "ERROR",
          payload: { jobKind: job.kind, ...notificationPayload(job, null) },
        });
        notifyNotificationsChanged();
        console.error("[tasks] Task failed", cause);
      }
    } catch (writeFailure) {
      console.error("[tasks] Unable to save task result", writeFailure);
    }
  } finally {
    notifyJobsChanged();
  }
}

/**
 * Fills every lane up to its limit. Safe to call on every write, and again
 * whenever a task settles.
 *
 * Nothing here is allowed to throw: an unhandled rejection would take the
 * server down, and a queue is not worth a page that stops answering.
 */
export function kickTaskRunner() {
  if (worker.held || worker.starting) return;
  try {
    for (const lane of Object.keys(LANE_LIMITS) as Lane[]) {
      while (worker.running[lane] < LANE_LIMITS[lane]) {
        const job = claimNext(lane);
        if (!job) break;
        const controller = new AbortController();
        worker.running[lane] += 1;
        worker.active.set(job.id, controller);
        void runOne(job, controller)
          .catch((cause) => console.error("[tasks] Task stopped", cause))
          .finally(() => {
            worker.running[lane] -= 1;
            worker.active.delete(job.id);
            kickTaskRunner();
          });
      }
    }
  } catch (cause) {
    console.error("[tasks] Queue stopped", cause);
  }
}

/**
 * A task left as `running` belongs to a server process that is gone. Every
 * handler is written to be safe to run twice, so it goes back in the queue
 * rather than being reported as failed. A download starts over.
 *
 * Runs once per process: a hot reload re-evaluates this module while the
 * worker is still running the tasks it would otherwise requeue.
 */
function recoverInterrupted() {
  if (worker.recovered) return;
  worker.recovered = true;
  const info = db
    .prepare(
      "UPDATE background_jobs SET status = 'queued', started_at = NULL, progress = NULL WHERE status = 'running'",
    )
    .run();
  if (info.changes > 0) notifyJobsChanged();
}

/**
 * Download workspaces that no task refers to belong to downloads cut off by a
 * restart, which start over in a fresh one. Files kept for inspection are
 * referenced by their task and stay.
 */
async function sweepDownloadWorkspaces() {
  const rows = db
    .prepare(
      "SELECT payload, outcome FROM background_jobs WHERE kind = 'VIDEO_DOWNLOAD'",
    )
    .all() as { payload: string; outcome: string | null }[];
  const keep = new Set<string>();
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as DownloadJobPayload;
    const outcome = row.outcome
      ? (JSON.parse(row.outcome) as DownloadJobFailure)
      : null;
    if (payload.selection?.workspace) keep.add(payload.selection.workspace);
    if (outcome?.retained?.workspace) keep.add(outcome.retained.workspace);
  }
  await sweepWorkspaces(keep);
}

// Importing this module must not be able to fail: it is pulled in by the
// request paths that queue work, and by the layout's dock through the stream.
try {
  const firstLoad = !worker.recovered;
  recoverInterrupted();
  if (firstLoad) {
    // Nothing may start until the sweep is done, or it could remove the
    // workspace of a download that has just begun.
    worker.starting = true;
    void sweepDownloadWorkspaces()
      .catch((cause) =>
        console.error("[tasks] Unable to sweep downloads", cause),
      )
      .finally(() => {
        worker.starting = false;
        kickTaskRunner();
      });
  } else {
    kickTaskRunner();
  }
} catch (cause) {
  console.error("[tasks] Unable to load queue at startup", cause);
}

/**
 * Queues the promotion of one tag, unless nothing is left to promote or the
 * same tag is already waiting. Returns the task id when one was added.
 */
export function enqueueTagPromotion(
  database: Database.Database,
  tagId: number,
): number | null {
  const pending = (
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM video_tags
         WHERE tag_id = ? AND source = 'vision' AND status = 'active'`,
      )
      .get(tagId) as { c: number }
  ).c;
  if (pending === 0) return null;

  const tag = database
    .prepare("SELECT name FROM tags WHERE id = ?")
    .get(tagId) as { name: string } | undefined;
  if (!tag) return null;

  const id = createJob(
    database,
    {
      kind: "TAG_APPROVAL",
      payload: { tagId, tagName: tag.name, pending },
    },
    "tagId",
  );
  if (id === null) return null;

  notifyJobsChanged();
  kickTaskRunner();
  return id;
}

/** Queues one video for recognition, deduplicated while it is active. */
export function enqueueVideoRetag(
  database: Database.Database,
  videoId: number,
  uiLocale?: string,
): number | null {
  const video = database
    .prepare("SELECT title FROM videos WHERE id = ?")
    .get(videoId) as { title: string } | undefined;
  if (!video) throw new AppError("videoMissing");

  const id = createJob(
    database,
    {
      kind: "VIDEO_RETAG",
      payload: {
        videoId,
        videoTitle: video.title,
        ...(uiLocale ? { uiLocale } : {}),
      },
    },
    "videoId",
  );
  if (id === null) return null;

  notifyJobsChanged();
  kickTaskRunner();
  return id;
}

/** Queues one catalog scan and prevents overlapping scans. */
export function enqueueCatalogScan(database: Database.Database): number | null {
  const id = createJob(
    database,
    {
      kind: "VIDEO_CATALOG_SCAN",
      payload: { scope: "video-catalog" },
    },
    "scope",
  );
  if (id === null) return null;

  notifyJobsChanged();
  kickTaskRunner();
  return id;
}

/**
 * Adds one download, started at once or parked as pending. Returns null when
 * a download of the same name is already pending, waiting or running, which
 * would otherwise fail only at the end.
 */
export function enqueueDownload(
  database: Database.Database,
  source: DownloaderSource,
  input: { name: string } & Record<string, unknown>,
  {
    start = true,
    recognize,
  }: { start?: boolean; recognize?: DownloadJobPayload["recognize"] } = {},
): number | null {
  const payload: DownloadJobPayload = {
    source,
    name: input.name,
    input,
    ...(recognize ? { recognize } : {}),
  };
  const id = createJob(
    database,
    {
      kind: "VIDEO_DOWNLOAD",
      payload,
      status: start ? "queued" : "pending",
    },
    "name",
  );
  if (id === null) return null;

  notifyJobsChanged();
  if (start) kickTaskRunner();
  return id;
}

/** Starts a pending download, or retries a settled one under the same entry. */
export function startDownload(database: Database.Database, id: number) {
  if (!requeueJob(database, id)) return false;
  notifyJobsChanged();
  kickTaskRunner();
  return true;
}
