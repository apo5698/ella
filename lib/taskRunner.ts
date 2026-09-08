import type Database from "better-sqlite3";
import db from "./db";
import {
  createJob,
  getJob,
  notifyJobsChanged,
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

/**
 * The in-process worker behind the task queue.
 *
 * One task runs at a time, oldest first. Its row in `background_jobs` is the
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
  canceled: () => boolean;
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
  if (!tag) throw new Error("标签不存在");

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
  if (!video) throw new Error("视频不存在");

  const tracker = createTracker(video.duration_sec, getTagSettings().strategy);
  setTotal(100);
  const ticker = setInterval(() => {
    advance(Math.min(99, Math.round(tracker.snapshot().ratio * 100)));
  }, PROGRESS_MS);

  try {
    const result = await suggestVideoTagsById(videoId, (update) =>
      tracker.update(update),
    );
    if (!result.ok) throw new Error(result.error);
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

const HANDLERS: Record<JobKind, TaskHandler> = {
  TAG_APPROVAL: promoteTagSource,
  VIDEO_RETAG: retagVideo,
  VIDEO_CATALOG_SCAN: scanCatalog,
};

// One runner per server process, held on globalThis so a hot reload in
// development does not start a second loop against the same table.
const g = globalThis as unknown as {
  __taskRunner?: { looping: boolean; canceling: Set<number> };
};
if (!g.__taskRunner) g.__taskRunner = { looping: false, canceling: new Set() };
const runner = g.__taskRunner;

/** Asks a running task to stop. It settles at its next chunk boundary. */
export function requestTaskCancel(id: number) {
  runner.canceling.add(id);
}

function claimNext(): Job | undefined {
  const next = db
    .prepare(
      "SELECT id FROM background_jobs WHERE status = 'queued' ORDER BY id LIMIT 1",
    )
    .get() as { id: number } | undefined;
  if (!next) return undefined;
  db.prepare(
    "UPDATE background_jobs SET status = 'running', started_at = ?, processed = 0, outcome = NULL WHERE id = ?",
  ).run(Date.now(), next.id);
  return getJob(db, next.id);
}

async function runOne(job: Job) {
  const handler = HANDLERS[job.kind];
  const finish = db.prepare(
    "UPDATE background_jobs SET status = ?, outcome = ?, finished_at = ? WHERE id = ?",
  );
  const writeProgress = db.prepare(
    "UPDATE background_jobs SET processed = ?, total = ? WHERE id = ?",
  );

  let total = 0;
  let processed = 0;
  let lastWrite = 0;
  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_MS) return;
    lastWrite = now;
    writeProgress.run(processed, total, job.id);
    notifyJobsChanged();
  };

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
      canceled: () => runner.canceling.has(job.id),
    });
    flush(true);
    const canceled = runner.canceling.has(job.id);
    finish.run(
      canceled ? "canceled" : "succeeded",
      JSON.stringify(outcome),
      Date.now(),
      job.id,
    );
    if (!canceled) {
      createNotification(db, {
        type: job.kind,
        payload: { ...job.payload, ...outcome },
      });
      notifyNotificationsChanged();
    }
  } catch (cause) {
    try {
      finish.run("failed", null, Date.now(), job.id);
      createNotification(db, {
        type: "ERROR",
        payload: { jobKind: job.kind, ...job.payload },
      });
      notifyNotificationsChanged();
      console.error("[tasks] 任务处理失败", cause);
    } catch (writeFailure) {
      console.error("[tasks] 无法写入任务结果", writeFailure);
    }
  } finally {
    runner.canceling.delete(job.id);
    notifyJobsChanged();
  }
}

/**
 * Starts the loop if it is not already running. Safe to call on every write.
 *
 * Nothing here is allowed to throw out of the async function: an unhandled
 * rejection would take the server down, and a queue is not worth a page that
 * stops answering.
 */
export function kickTaskRunner() {
  if (runner.looping) return;
  runner.looping = true;
  void (async () => {
    try {
      for (let job = claimNext(); job; job = claimNext()) {
        await runOne(job);
      }
    } catch (cause) {
      console.error("[tasks] 队列已停止", cause);
    } finally {
      runner.looping = false;
    }
  })();
}

/**
 * A task left as `running` belongs to a server process that is gone. Every
 * handler is written to be safe to run twice, so it goes back in the queue
 * rather than being reported as failed.
 */
function recoverInterrupted() {
  const info = db
    .prepare(
      "UPDATE background_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'",
    )
    .run();
  if (info.changes > 0) notifyJobsChanged();
}

// Importing this module must not be able to fail: it is pulled in by the
// request paths that queue work, and by the layout's dock through the stream.
try {
  recoverInterrupted();
  kickTaskRunner();
} catch (cause) {
  console.error("[tasks] 启动时无法读取队列", cause);
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
): number | null {
  const video = database
    .prepare("SELECT title FROM videos WHERE id = ?")
    .get(videoId) as { title: string } | undefined;
  if (!video) throw new Error("视频不存在");

  const id = createJob(
    database,
    {
      kind: "VIDEO_RETAG",
      payload: { videoId, videoTitle: video.title },
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
