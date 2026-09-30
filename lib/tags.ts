import { AppError } from "@/lib/appError";
import type Database from "better-sqlite3";
import {
  ensureTag,
  isAssignableTag,
  loadTagPaths,
  resolveTagName,
} from "./tagHierarchy";
import { ensureSeries, normalizeSeriesName } from "./series";
import { sortNames, sortTags } from "./tagOrder";
import type { VideoTagState } from "./types";

/** Reads the complete editable tag state of one video. */
export function loadVideoTagState(
  db: Database.Database,
  videoId: number,
): VideoTagState {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, vt.source, vt.status
       FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
       WHERE vt.video_id = ?`,
    )
    .all(videoId) as {
    id: number;
    name: string;
    source: string;
    status: string;
  }[];
  const series = db
    .prepare(
      `SELECT s.name FROM videos v
       LEFT JOIN series s ON s.id = v.series_id
       WHERE v.id = ?`,
    )
    .get(videoId) as { name: string | null } | undefined;
  const paths = loadTagPaths(db);

  return {
    tags: sortTags(
      rows
        .filter((row) => row.status === "active")
        .map((row) => ({
          id: row.id,
          name: row.name,
          source: row.source,
          path: paths.get(row.id) ?? [row.name],
        })),
    ),
    rejectedTags: sortNames(
      rows.filter((row) => row.status === "rejected").map((row) => row.name),
    ),
    seriesName: series?.name ?? null,
  };
}

/**
 * Replaces every editable association for a video. The caller owns the
 * transaction so metadata and tags can be committed by one Save action.
 */
export function replaceVideoTagState(
  db: Database.Database,
  videoId: number,
  state: VideoTagState,
): void {
  const active = Array.isArray(state.tags) ? state.tags : [];
  const rejected = Array.isArray(state.rejectedTags) ? state.rejectedTags : [];
  const seen = new Set<string>();
  const links: { id: number; source: "manual" | "vision"; status: string }[] =
    [];

  for (const requested of active) {
    const source = requested.source === "manual" ? "manual" : "vision";
    const tag = ensureTag(
      db,
      String(requested.name ?? ""),
      source === "vision" ? "automatic" : "approved",
    );
    if (!isAssignableTag(db, tag.id)) {
      throw new AppError("categoryTag", { name: tag.name });
    }
    if (seen.has(tag.name)) continue;
    seen.add(tag.name);
    links.push({ id: tag.id, source, status: "active" });
  }

  for (const requested of rejected) {
    const resolved = resolveTagName(db, String(requested ?? ""));
    if (!resolved.name || resolved.id === null || seen.has(resolved.name)) {
      continue;
    }
    seen.add(resolved.name);
    links.push({ id: resolved.id, source: "vision", status: "rejected" });
  }

  db.prepare("DELETE FROM video_tags WHERE video_id = ?").run(videoId);
  const insert = db.prepare(
    "INSERT INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, ?, ?)",
  );
  for (const link of links) {
    insert.run(videoId, link.id, link.source, link.status);
  }

  const seriesName =
    typeof state.seriesName === "string"
      ? normalizeSeriesName(state.seriesName)
      : "";
  if (seriesName) {
    const series = ensureSeries(db, seriesName);
    db.prepare("UPDATE videos SET series_id = ? WHERE id = ?").run(
      series.id,
      videoId,
    );
  } else {
    db.prepare("UPDATE videos SET series_id = NULL WHERE id = ?").run(videoId);
  }
}

/**
 * Replaces the `source` tags of a video with `tagNames`.
 *
 * Names are resolved before they are stored, so a model that writes an alias
 * tags the video with the tag it stands for. This is the archival half of
 * aliases: nothing is lost,
 * and the library does not grow a second spelling of a tag it already has.
 *
 * Rejected tags (ones the user removed) survive regeneration in two ways:
 * they are not cleared, and any incoming tag that the user already rejected
 * for this video is dropped rather than re-added.
 *
 * Generated associations stay generated even when the tag is approved.
 * Approval says the word belongs to the library; whether it fits this video
 * is still the model's guess until the user accepts it here.
 */
export function upsertVideoTags(
  db: Database.Database,
  videoId: number,
  tagNames: string[],
  source: string,
) {
  const linkTag = db.prepare(
    "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, ?, 'active')",
  );
  // Only clear the active rows: rejections are a record of user intent.
  const deleteForSource = db.prepare(
    "DELETE FROM video_tags WHERE video_id = ? AND source = ? AND status = 'active'",
  );
  const rejectedStmt = db.prepare(
    `SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
     WHERE vt.video_id = ? AND vt.status = 'rejected'`,
  );
  const reviewState = db.prepare("SELECT review_state FROM tags WHERE id = ?");

  const tx = db.transaction((names: string[]) => {
    const rejected = new Set(
      (rejectedStmt.all(videoId) as { name: string }[]).map((r) => r.name),
    );
    deleteForSource.run(videoId, source);
    for (const raw of names) {
      if (!raw.trim()) continue;
      // Resolved before the rejection check: rejecting a tag rejects every
      // alias of it as well, since they are the same tag.
      const tag = ensureTag(
        db,
        raw,
        source === "vision" ? "automatic" : "approved",
      );
      if (rejected.has(tag.name)) continue;
      const state = (reviewState.get(tag.id) as { review_state: string })
        .review_state;
      // An excluded tag is refused library wide, not only on the videos it
      // was removed from.
      if (source === "vision" && state === "excluded") continue;
      // A word that names a group is dropped rather than stored, since the
      // video earns a child of it or nothing.
      if (!isAssignableTag(db, tag.id)) continue;
      linkTag.run(videoId, tag.id, source);
    }
  });
  tx(tagNames);
}

/** Tags the user removed — fed back to the model as negative examples. */
export function getRejectedTags(
  db: Database.Database,
  videoId: number,
): string[] {
  return (
    db
      .prepare(
        `SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
         WHERE vt.video_id = ? AND vt.status = 'rejected'
         ORDER BY t.name`,
      )
      .all(videoId) as { name: string }[]
  ).map((r) => r.name);
}

/**
 * Videos Smartag has already run on. Any generated association counts,
 * rejected ones included: a video whose every generated tag the user removed
 * was still recognized. Manual tags do not, so a video tagged only by hand is
 * still offered to the model.
 */
export const RECOGNIZED_VIDEO_IDS =
  "SELECT video_id FROM video_tags WHERE source = 'vision'";

/** Upper bound on vocabulary terms per prompt, so a large library stays within a small model's context. */
const VOCABULARY_LIMIT = 300;

export type RecognitionLibrary = {
  vocabulary: string[];
  groups: string[];
  excluded: string[];
};

/**
 * The library-wide reference data handed to the model on every run.
 *
 * The vocabulary is the words a person vouched for: approved tags, and
 * automatic ones the user placed in the tree. These are the terms the model
 * cannot reach on its own: it describes what it sees in general language, and
 * a term it was never given is a term it will never produce. Its other past
 * output is deliberately not fed back, which would only entrench whatever it
 * drifted towards.
 *
 * Groups are named so the model can avoid them, since a group name is dropped
 * on write. Excluded tags are refused on write as well; naming them lets the
 * model spend its tag budget elsewhere.
 */
export function getRecognitionLibrary(
  db: Database.Database,
): RecognitionLibrary {
  const names = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).all(...params) as { name: string }[]).map((r) => r.name);

  return {
    vocabulary: names(
      `SELECT t.name
       FROM tags t
       LEFT JOIN video_tags vt ON vt.tag_id = t.id AND vt.status = 'active'
       WHERE t.assignable = 1
         AND (t.review_state = 'approved'
              OR (t.review_state = 'automatic' AND t.parent_id IS NOT NULL))
       GROUP BY t.id
       ORDER BY COUNT(vt.video_id) DESC, t.name
       LIMIT ?`,
      VOCABULARY_LIMIT,
    ),
    groups: names("SELECT name FROM tags WHERE assignable = 0 ORDER BY name"),
    excluded: names(
      "SELECT name FROM tags WHERE review_state = 'excluded' ORDER BY name",
    ),
  };
}
