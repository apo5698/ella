import type Database from "better-sqlite3";

export const JOB_KINDS = [
  "TAG_APPROVAL",
  "VIDEO_RETAG",
  "VIDEO_CATALOG_SCAN",
] as const;
export const JOB_STATUSES = [
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
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type JobRow = Omit<Job, "payload" | "outcome"> & {
  payload: string;
  outcome: string | null;
};

const COLUMNS = `id, kind, payload, status, processed, total, outcome,
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

export function getJob(db: Database.Database, id: number): Job | undefined {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM background_jobs WHERE id = ?`)
    .get(id) as JobRow | undefined;
  return row && toJob(row);
}

export function createJob(
  db: Database.Database,
  job: { kind: JobKind; payload: JobPayload },
  dedupeKey?: string,
): number | null {
  const payload = JSON.stringify(job.payload);
  if (dedupeKey !== undefined) {
    const pending = db
      .prepare(
        `SELECT id FROM background_jobs
         WHERE kind = ? AND status IN ('queued', 'running')
           AND json_extract(payload, '$.' || ?) = json_extract(?, '$.' || ?)`,
      )
      .get(job.kind, dedupeKey, payload, dedupeKey) as
      { id: number } | undefined;
    if (pending) return null;
  }

  const info = db
    .prepare(
      `INSERT INTO background_jobs (kind, payload, status, created_at)
       VALUES (?, ?, 'queued', ?)`,
    )
    .run(job.kind, payload, Date.now());
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
