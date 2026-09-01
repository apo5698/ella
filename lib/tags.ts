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
): number[] {
  const active = Array.isArray(state.tags) ? state.tags : [];
  const rejected = Array.isArray(state.rejectedTags) ? state.rejectedTags : [];
  const seen = new Set<string>();
  const links: { id: number; source: "manual" | "vision"; status: string }[] =
    [];
  const promotionIds = new Set<number>();
  const existingSources = new Map(
    (
      db
        .prepare("SELECT tag_id, source FROM video_tags WHERE video_id = ?")
        .all(videoId) as { tag_id: number; source: string }[]
    ).map((link) => [link.tag_id, link.source]),
  );

  for (const requested of active) {
    const source = requested.source === "manual" ? "manual" : "vision";
    const tag = ensureTag(
      db,
      String(requested.name ?? ""),
      source === "vision" ? "automatic" : "approved",
    );
    if (!isAssignableTag(db, tag.id)) {
      throw new Error(`"${tag.name}"是分类标签，请改用其下的子标签`);
    }
    if (seen.has(tag.name)) continue;
    seen.add(tag.name);
    links.push({ id: tag.id, source, status: "active" });
    if (source === "manual" && existingSources.get(tag.id) !== "manual") {
      promotionIds.add(tag.id);
    }
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

  return [...promotionIds];
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
 * A tag is the user's own or the model's, never both. A generated tag that the
 * user has accepted somewhere therefore joins this video as manual as well:
 * one tag split across both sources made "accepted" a fact about a video
 * rather than about the word, which is what accepting is actually saying.
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
  const approvedTag = db.prepare(
    "SELECT 1 FROM tags WHERE id = ? AND review_state = 'approved'",
  );

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
      // The model does not know the tree: a word that names a group is dropped
      // rather than stored, since the video earns a child of it or nothing.
      if (!isAssignableTag(db, tag.id)) continue;
      const linkSource =
        source === "vision" && approvedTag.get(tag.id) ? "manual" : source;
      linkTag.run(videoId, tag.id, linkSource);
    }
  });
  tx(tagNames);
}

/** Tags the user explicitly added — treated as ground truth. */
export function getManualTags(
  db: Database.Database,
  videoId: number,
): string[] {
  return (
    db
      .prepare(
        `SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
         WHERE vt.video_id = ? AND vt.source = 'manual' AND vt.status = 'active'
         ORDER BY t.name`,
      )
      .all(videoId) as { name: string }[]
  ).map((r) => r.name);
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
 * Every tag the user has added by hand, most-used first.
 *
 * Handed to the model on every run, whole. These are the words the library
 * actually uses, and the ones the model cannot reach on its own: it describes
 * what it sees in general language, and a term it was never given is a term it
 * will never produce. Its own past output is deliberately not fed back, which
 * would only entrench whatever it drifted towards.
 */
export function getAllManualTags(db: Database.Database): string[] {
  return (
    db
      .prepare(
        `SELECT t.name, COUNT(*) AS uses
         FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
         WHERE vt.source = 'manual' AND vt.status = 'active'
         GROUP BY t.id
         ORDER BY uses DESC, t.name`,
      )
      .all() as { name: string; uses: number }[]
  ).map((row) => row.name);
}
