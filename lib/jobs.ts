import type Database from "better-sqlite3";

export const JOB_KINDS = [
  "TAG_APPROVAL",
  "VIDEO_RETAG",
  "VIDEO_CATALOG_SCAN",
  "VIDEO_DOWNLOAD",
] as const;
export const JOB_STATUSES = [
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobPayload = Record<string, unknown>;

export type Job = {
  id: number;
  kind: JobKind;
  payload: JobPayload;
  status: JobStatus;
  processed: number;
  total: number;
  outcome: JobPayload | null;
  /** Handler-defined detail beyond processed/total, while it runs. */
  progress: JobPayload | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type JobRow = Omit<Job, "payload" | "outcome" | "progress"> & {
  payload: string;
  outcome: string | null;
  progress: string | null;
};

const COLUMNS = `id, kind, payload, status, processed, total, outcome, progress,
  created_at AS createdAt, started_at AS startedAt,
  finished_at AS finishedAt`;

function parseObject(value: string | null): JobPayload {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as JobPayload)
      : {};
  } catch {
    return {};
  }
}

function toJob(row: JobRow): Job {
  return {
    ...row,
    payload: parseObject(row.payload),
    outcome: row.outcome === null ? null : parseObject(row.outcome),
    progress: row.progress === null ? null : parseObject(row.progress),
  };
}

export function listJobs(db: Database.Database, limit = 50): Job[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM background_jobs
       ORDER BY
         CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
         id DESC
       LIMIT ?`,
    )
    .all(limit) as JobRow[];
  return rows.map(toJob);
}

/**
 * Every task of one kind: running, then waiting to start, then parked, then
 * settled with the newest first.
 */
export function listJobsOfKind(db: Database.Database, kind: JobKind): Job[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM background_jobs
       WHERE kind = ?
       ORDER BY
         CASE status
           WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'pending' THEN 2
           ELSE 3
         END,
         COALESCE(finished_at, started_at, created_at) DESC,
         id DESC`,
    )
    .all(kind) as JobRow[];
  return rows.map(toJob);
}

export function getJob(db: Database.Database, id: number): Job | undefined {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM background_jobs WHERE id = ?`)
    .get(id) as JobRow | undefined;
  return row && toJob(row);
}

/**
 * Adds a task. A `pending` task waits for someone to start it; a `queued` one
 * is picked up by the runner.
 */
export function createJob(
  db: Database.Database,
  job: { kind: JobKind; payload: JobPayload; status?: "queued" | "pending" },
  dedupeKey?: string,
): number | null {
  const payload = JSON.stringify(job.payload);
  if (dedupeKey !== undefined) {
    const pending = db
      .prepare(
        `SELECT id FROM background_jobs
         WHERE kind = ? AND status IN ('pending', 'queued', 'running')
           AND json_extract(payload, '$.' || ?) = json_extract(?, '$.' || ?)`,
      )
      .get(job.kind, dedupeKey, payload, dedupeKey) as
      { id: number } | undefined;
    if (pending) return null;
  }

  const info = db
    .prepare(
      `INSERT INTO background_jobs (kind, payload, status, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(job.kind, payload, job.status ?? "queued", Date.now());
  return Number(info.lastInsertRowid);
}

export function cancelQueuedJob(db: Database.Database, id: number): boolean {
  return (
    db
      .prepare(
        `UPDATE background_jobs
         SET status = 'canceled', finished_at = ?
         WHERE id = ? AND status = 'queued'`,
      )
      .run(Date.now(), id).changes > 0
  );
}

/**
 * Queues a parked or settled task again in place, so a download keeps one
 * entry in its history however often it is retried.
 */
export function requeueJob(db: Database.Database, id: number): boolean {
  return (
    db
      .prepare(
        `UPDATE background_jobs
         SET status = 'queued', processed = 0, total = 0, outcome = NULL,
           progress = NULL, started_at = NULL, finished_at = NULL
         WHERE id = ? AND status IN ('pending', 'failed', 'canceled')`,
      )
      .run(id).changes > 0
  );
}

/** Removes a task that is not running or queued. Its notification stays. */
export function deleteFinishedJob(db: Database.Database, id: number): boolean {
  return (
    db
      .prepare(
        `DELETE FROM background_jobs
         WHERE id = ? AND status NOT IN ('queued', 'running')`,
      )
      .run(id).changes > 0
  );
}

/** Removes every settled task of one kind. Their notifications stay. */
export function deleteFinishedJobsOfKind(
  db: Database.Database,
  kind: JobKind,
): number {
  return db
    .prepare(
      `DELETE FROM background_jobs
       WHERE kind = ? AND status IN ('succeeded', 'failed', 'canceled')`,
    )
    .run(kind).changes;
}

export function setJobPayload(
  db: Database.Database,
  id: number,
  payload: JobPayload,
) {
  db.prepare("UPDATE background_jobs SET payload = ? WHERE id = ?").run(
    JSON.stringify(payload),
    id,
  );
}

export function setJobOutcome(
  db: Database.Database,
  id: number,
  outcome: JobPayload,
) {
  db.prepare("UPDATE background_jobs SET outcome = ? WHERE id = ?").run(
    JSON.stringify(outcome),
    id,
  );
}

export function retryJob(db: Database.Database, id: number): number | null {
  const job = getJob(db, id);
  if (!job) return null;
  return createJob(db, { kind: job.kind, payload: job.payload });
}

type Listener = () => void;
const g = globalThis as unknown as { __jobListeners?: Set<Listener> };
if (!g.__jobListeners) g.__jobListeners = new Set();
const listeners = g.__jobListeners;

export function subscribeJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyJobsChanged() {
  for (const listener of listeners) listener();
}
