import type Database from "better-sqlite3";
import db from "./db";
import {
  createTask,
  getTask,
  notifyTasksChanged,
  type Task,
  type TaskKind,
} from "./tasks";
import { createTracker } from "./progress";
import { scanVideoCatalog } from "./catalogScan";
import { getTagSettings } from "./settingsStore";
import { suggestVideoTagsById } from "./vision";
import { upsertVideoTags } from "./tags";

/**
 * The in-process worker behind the task queue.
 *
 * One task runs at a time, oldest first. The row in `tasks` is the source of
 * truth: progress is written there rather than held in memory, so the queue
 * page and the dock read the same numbers, and a server that restarts mid-task
 * picks the work up again instead of losing it.
 */

/** Rows rewritten per statement. Small enough to stay responsive to a cancel. */
const CHUNK = 200;

/** How often progress reaches the database while a task runs. */
const PROGRESS_MS = 250;

type TaskContext = {
  payload: Record<string, unknown>;
  setTotal: (total: number) => void;
  advance: (processed: number) => void;
  canceled: () => boolean;
};

/** Returns the line the queue page shows once the task has succeeded. */
type TaskHandler = (ctx: TaskContext) => Promise<string>;

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

  return `${done} 个视频上的"${tag.name}"已转为已审核标签`;
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
    if (canceled()) return `已停止重新识别"${video.title}"`;

    upsertVideoTags(db, videoId, result.tags, "vision");
    const count = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM video_tags WHERE video_id = ? AND status = 'active'",
        )
        .get(videoId) as { c: number }
    ).c;
    advance(100);
    return `"${video.title}"已重新识别，共 ${count} 个标签`;
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

  return [
    `新增 ${result.added}`,
    `更新 ${result.updated}`,
    `未变 ${result.skipped}`,
    `移除 ${result.removed}`,
  ].join("，");
};

const HANDLERS: Record<TaskKind, TaskHandler> = {
  "promote-tag-source": promoteTagSource,
  "retag-video": retagVideo,
  "scan-video-catalog": scanCatalog,
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

function claimNext(): Task | undefined {
  const next = db
    .prepare("SELECT id FROM tasks WHERE status = 'queued' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!next) return undefined;
  db.prepare(
    "UPDATE tasks SET status = 'running', started_at = ?, processed = 0, error = NULL WHERE id = ?",
  ).run(Date.now(), next.id);
  return getTask(db, next.id);
}

async function runOne(task: Task) {
  const handler = HANDLERS[task.kind];
  const finish = db.prepare(
    "UPDATE tasks SET status = ?, result = ?, error = ?, finished_at = ? WHERE id = ?",
  );
  const writeProgress = db.prepare(
    "UPDATE tasks SET processed = ?, total = ? WHERE id = ?",
  );

  let total = 0;
  let processed = 0;
  let lastWrite = 0;
  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_MS) return;
    lastWrite = now;
    writeProgress.run(processed, total, task.id);
    notifyTasksChanged();
  };

  notifyTasksChanged();

  try {
    if (!handler) throw new Error(`未知任务类型：${task.kind}`);
    const result = await handler({
      payload: JSON.parse(task.payload) as Record<string, unknown>,
      setTotal: (value) => {
        total = value;
        flush(true);
      },
      advance: (value) => {
        processed = value;
        flush(false);
      },
      canceled: () => runner.canceling.has(task.id),
    });
    flush(true);
    const canceled = runner.canceling.has(task.id);
    finish.run(
      canceled ? "canceled" : "succeeded",
      result,
      null,
      Date.now(),
      task.id,
    );
  } catch (cause) {
    try {
      finish.run(
        "failed",
        null,
        cause instanceof Error ? cause.message : "任务失败",
        Date.now(),
        task.id,
      );
    } catch (writeFailure) {
      console.error("[tasks] 无法写入任务结果", writeFailure);
    }
  } finally {
    runner.canceling.delete(task.id);
    notifyTasksChanged();
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
      for (let task = claimNext(); task; task = claimNext()) {
        await runOne(task);
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
      "UPDATE tasks SET status = 'queued', started_at = NULL WHERE status = 'running'",
    )
    .run();
  if (info.changes > 0) notifyTasksChanged();
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

  const id = createTask(
    database,
    {
      kind: "promote-tag-source",
      title: `将"${tag.name}"转为已审核标签（${pending} 个视频）`,
      payload: { tagId, tagName: tag.name },
    },
    "tagId",
  );
  if (id === null) return null;

  notifyTasksChanged();
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

  const id = createTask(
    database,
    {
      kind: "retag-video",
      title: `重新识别"${video.title}"的标签`,
      payload: { videoId, videoTitle: video.title },
    },
    "videoId",
  );
  if (id === null) return null;

  notifyTasksChanged();
  kickTaskRunner();
  return id;
}

/** Queues one catalog scan and prevents overlapping scans. */
export function enqueueCatalogScan(database: Database.Database): number | null {
  const id = createTask(
    database,
    {
      kind: "scan-video-catalog",
      title: "扫描视频目录",
      payload: { scope: "video-catalog" },
    },
    "scope",
  );
  if (id === null) return null;

  notifyTasksChanged();
  kickTaskRunner();
  return id;
}
