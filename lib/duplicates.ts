// What the library may already hold. The name can be answered before a
// download starts, the content only once the file is out of the archive.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { VIDEO_ROOT } from "./config";
import { isSameVideoName, nameSimilarity } from "./similarity";

/** Below this a match is noise. Names this close are worth showing. */
export const SIMILAR_THRESHOLD = 0.6;
export const SIMILAR_LIMIT = 5;

/** A duplicate is certain at this size gap and this duration gap. */
const DURATION_TOLERANCE_SEC = 1;
const SIZE_TOLERANCE = 0.02;

export type VideoRef = { id: number; title: string };
export type NameMatch = VideoRef & { score: number };
export type ContentMatch = VideoRef & { reason: "identical" | "close" };

function fileBase(filename: string, ext: string) {
  return filename.slice(0, filename.length - ext.length).toLowerCase();
}

/**
 * The record whose file would be overwritten. The extension is not known
 * until the archive is open, so the comparison is on the base name: two
 * videos differing only in container are a clash worth reporting anyway.
 */
export function findNameConflict(
  db: Database.Database,
  base: string,
): VideoRef | null {
  const target = base.trim().toLowerCase();
  if (!target) return null;
  const rows = db
    .prepare("SELECT id, title, filename, ext FROM videos")
    .all() as (VideoRef & { filename: string; ext: string })[];
  const match = rows.find((row) => fileBase(row.filename, row.ext) === target);
  return match ? { id: match.id, title: match.title } : null;
}

/**
 * A file already sitting in the library folder under that base name. The
 * catalog is not the only way one gets there: anything copied in by hand is
 * on disk before a scan records it.
 */
export function fileBaseExists(base: string): boolean {
  const target = base.trim().toLowerCase();
  if (!target) return false;
  let entries: string[];
  try {
    entries = fs.readdirSync(VIDEO_ROOT);
  } catch {
    // The library folder is created on first download.
    return false;
  }
  return entries.some(
    (entry) => path.parse(entry).name.toLowerCase() === target,
  );
}

/**
 * The video this name already describes. A name is not a file, so this is a
 * different question from findNameConflict: that one answers what would be
 * overwritten, this one what would be downloaded a second time under a
 * slightly different name.
 */
export function findDuplicateName(
  db: Database.Database,
  name: string,
): NameMatch | null {
  if (!name.trim()) return null;
  const rows = db.prepare("SELECT id, title FROM videos").all() as VideoRef[];
  let best: NameMatch | null = null;
  for (const row of rows) {
    if (!isSameVideoName(name, row.title)) continue;
    const score = nameSimilarity(name, row.title);
    if (!best || score > best.score) best = { ...row, score };
  }
  return best;
}

/**
 * Titles close enough to the requested name to be worth a second look. Every
 * title is scored: the library is small, and the noise a name picks up along
 * the way defeats any index that could narrow the field first.
 */
export function findSimilarNames(
  db: Database.Database,
  name: string,
  limit = SIMILAR_LIMIT,
): NameMatch[] {
  if (!name.trim()) return [];
  const rows = db.prepare("SELECT id, title FROM videos").all() as VideoRef[];
  const matches: NameMatch[] = [];
  for (const row of rows) {
    const score = nameSimilarity(name, row.title);
    if (score >= SIMILAR_THRESHOLD) matches.push({ ...row, score });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Videos the file itself matches, whatever it is called. `identical` means the
 * byte count is the same and the duration agrees, which no two different
 * videos manage; `close` is a duration within a second and a size within a
 * fraction, which videos cut from one source do manage, so it is only ever
 * reported.
 */
export function findContentDuplicates(
  db: Database.Database,
  size: number,
  duration: number | null,
): ContentMatch[] {
  const rows = db
    .prepare(
      `SELECT id, title, size_bytes, duration_sec FROM videos
       WHERE size_bytes = :size
          OR (:duration IS NOT NULL
              AND duration_sec IS NOT NULL
              AND ABS(duration_sec - :duration) <= :durationTolerance
              AND ABS(size_bytes - :size) <= :sizeTolerance)`,
    )
    .all({
      size,
      duration,
      durationTolerance: DURATION_TOLERANCE_SEC,
      sizeTolerance: Math.round(size * SIZE_TOLERANCE),
    }) as (VideoRef & { size_bytes: number; duration_sec: number | null })[];
  return rows.map((row) => {
    const sameDuration =
      duration === null ||
      row.duration_sec === null ||
      Math.abs(row.duration_sec - duration) <= DURATION_TOLERANCE_SEC;
    return {
      id: row.id,
      title: row.title,
      reason:
        row.size_bytes === size && sameDuration
          ? ("identical" as const)
          : ("close" as const),
    };
  });
}
