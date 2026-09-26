import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { DB_PATH } from "@/lib/config";

/**
 * Where downloads unpack. Beside the database rather than in the system temp
 * directory: a file kept for inspection must survive a container being
 * recreated, and the sweep below must only ever see this instance's files.
 */
export const DOWNLOAD_WORK_ROOT = path.resolve(
  process.env.DOWNLOAD_WORK_DIR || path.join(path.dirname(DB_PATH), "work"),
);

export async function createWorkspace(prefix: string) {
  await mkdir(DOWNLOAD_WORK_ROOT, { recursive: true });
  return mkdtemp(path.join(DOWNLOAD_WORK_ROOT, `${prefix}-`));
}

/** Refuses anything outside the work root, whatever a stored path says. */
export function isWorkspace(directory: string) {
  const resolved = path.resolve(directory);
  return (
    path.dirname(resolved) === DOWNLOAD_WORK_ROOT &&
    path.basename(resolved) !== ""
  );
}

export async function discardWorkspace(directory: string | undefined) {
  if (!directory || !isWorkspace(directory)) return;
  await rm(directory, { recursive: true, force: true });
}

/**
 * Removes workspaces nothing refers to: those of downloads cut off by a
 * restart, which start over in a new one. Run before any task starts.
 */
export async function sweepWorkspaces(keep: Set<string>) {
  let entries: string[];
  try {
    entries = await readdir(DOWNLOAD_WORK_ROOT);
  } catch {
    return;
  }
  const kept = new Set([...keep].map((directory) => path.resolve(directory)));
  await Promise.all(
    entries
      .map((entry) => path.join(DOWNLOAD_WORK_ROOT, entry))
      .filter((directory) => !kept.has(directory))
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
