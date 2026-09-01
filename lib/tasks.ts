import type Database from "better-sqlite3";

/**
 * The queue as the rest of the app sees it: rows, the operations the UI can
 * perform on them, and a subscription for live updates. Execution lives in
 * lib/taskRunner.ts, which is the only thing that moves a task to `running`.
 */

export const TASK_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Every kind of work the queue can run. */
export const TASK_KINDS = [
  "promote-tag-source",
  "retag-video",
  "scan-video-catalog",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type Task = {
  id: number;
  kind: TaskKind;
  title: string;
  payload: string;
  status: TaskStatus;
  processed: number;
  total: number;
  result: string | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

/** How many tasks the queue page and the dock read at once. */
export const TASK_LIST_LIMIT = 50;

const COLUMNS = `id, kind, title, payload, status, processed, total, result, error,
  created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt`;

export function listTasks(
  db: Database.Database,
  limit = TASK_LIST_LIMIT,
): Task[] {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM tasks
       ORDER BY
         CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
         id DESC
       LIMIT ?`,
    )
    .all(limit) as Task[];
}

export function getTask(db: Database.Database, id: number): Task | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`).get(id) as
    Task | undefined;
}

/** How many tasks are waiting or running, which is what the dock counts. */
export function activeTaskCount(db: Database.Database): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM tasks WHERE status IN ('queued', 'running')",
      )
      .get() as { c: number }
  ).c;
}

/** Total history count, independent of the page-size limit above. */
export function taskCount(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM tasks").get() as { c: number })
    .c;
}

// --- change notification ---------------------------------------------------
// One set of listeners per server process, held on globalThis so a hot reload
// in development does not strand the connections opened by the last instance.

type Listener = () => void;

const g = globalThis as unknown as { __taskListeners?: Set<Listener> };
if (!g.__taskListeners) g.__taskListeners = new Set();
const listeners = g.__taskListeners;

export function subscribeTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announces that the table changed. Readers re-read; no state travels here. */
export function notifyTasksChanged() {
  for (const listener of listeners) listener();
}

// --- writes ----------------------------------------------------------------

/**
 * Adds a task and returns its id. `dedupeKey`, when given, is a payload field
 * whose value must be unique among the tasks not yet finished: queueing the
 * same promotion twice would run it twice for no gain.
 */
export function createTask(
  db: Database.Database,
  task: { kind: TaskKind; title: string; payload: Record<string, unknown> },
  dedupeKey?: string,
): number | null {
  const payload = JSON.stringify(task.payload);
  if (dedupeKey !== undefined) {
    const pending = db
      .prepare(
        `SELECT id FROM tasks
         WHERE kind = ? AND status IN ('queued', 'running')
           AND json_extract(payload, '$.' || ?) = json_extract(?, '$.' || ?)`,
      )
      .get(task.kind, dedupeKey, payload, dedupeKey) as
      { id: number } | undefined;
    if (pending) return null;
  }

  const info = db
    .prepare(
      `INSERT INTO tasks (kind, title, payload, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(task.kind, task.title, payload, Date.now());
  return Number(info.lastInsertRowid);
}

/**
 * Stops a task. A queued one never starts; a running one is asked to stop and
 * settles when its handler next checks, so the row is left alone here.
 */
export function cancelQueuedTask(db: Database.Database, id: number): boolean {
  const info = db
    .prepare(
      "UPDATE tasks SET status = 'canceled', finished_at = ? WHERE id = ? AND status = 'queued'",
    )
    .run(Date.now(), id);
  return info.changes > 0;
}

/** Queues the same work again, as a new row: the old one stays as history. */
export function retryTask(db: Database.Database, id: number): number | null {
  const task = getTask(db, id);
  if (!task) return null;
  const info = db
    .prepare(
      `INSERT INTO tasks (kind, title, payload, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(task.kind, task.title, task.payload, Date.now());
  return Number(info.lastInsertRowid);
}

export function clearFinishedTasks(db: Database.Database): number {
  return db
    .prepare(
      "DELETE FROM tasks WHERE status IN ('succeeded', 'failed', 'canceled')",
    )
    .run().changes;
}
