import type Database from "better-sqlite3";
import { compareNames } from "./tagOrder";
import type { TagReviewState, TagTreeNode } from "./types";
import { normalizeName } from "./names";

/**
 * The tag graph: a tag may sit under one parent, and may answer to any number
 * of aliases.
 *
 * Two rules hold everywhere below, and everything else follows from them:
 *
 *  1. A video is only ever linked to a canonical tag. An alias is a spelling,
 *     not a tag, so every write path resolves before it inserts.
 *  2. A parent stands for its whole subtree. Filtering or searching for it
 *     returns the videos tagged with anything beneath it, because that is
 *     what making them children was for.
 */

/** How deep the walks below will follow a chain before giving up. */
const MAX_DEPTH = 16;

/**
 * Tag names are stored as typed apart from surrounding space. Latin text is
 * lowercased and its spaces closed up so `Bondage rope` and `bondage-rope` are
 * one tag; Chinese passes through untouched.
 */
export function normalizeTagName(name: string): string {
  return normalizeName(name);
}

export type ResolvedTag = {
  /** The canonical name, which is what a video is tagged with. */
  name: string;
  /** Null when nothing by this name exists yet. */
  id: number | null;
  /** The spelling that was typed, when it differed from the canonical name. */
  alias: string | null;
};

/**
 * Maps whatever was typed onto the tag that will actually be used. An unknown
 * name resolves to itself with no id, which is how a new tag begins.
 */
export function resolveTagName(
  db: Database.Database,
  raw: string,
): ResolvedTag {
  const name = normalizeTagName(raw);
  if (!name) return { name: "", id: null, alias: null };

  const exact = db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as
    { id: number } | undefined;
  if (exact) return { name, id: exact.id, alias: null };

  const viaAlias = db
    .prepare(
      "SELECT t.id, t.name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE a.alias = ?",
    )
    .get(name) as { id: number; name: string } | undefined;
  if (viaAlias) return { name: viaAlias.name, id: viaAlias.id, alias: name };

  return { name, id: null, alias: null };
}

/**
 * Whether a tag may be put on a video. A tag marked otherwise exists to group
 * its children, and a video reaches it by carrying one of them.
 */
export function isAssignableTag(db: Database.Database, tagId: number): boolean {
  const row = db
    .prepare("SELECT assignable FROM tags WHERE id = ?")
    .get(tagId) as { assignable: number } | undefined;
  return row === undefined || row.assignable !== 0;
}

/** Active videos that carry this exact tag, excluding its descendants. */
export function directActiveVideoCount(
  db: Database.Database,
  tagId: number,
): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM video_tags WHERE tag_id = ? AND status = 'active'",
      )
      .get(tagId) as { count: number }
  ).count;
}

/** Resolves, creating the tag if the name is new. */
export function ensureTag(
  db: Database.Database,
  raw: string,
  initialReviewState: TagReviewState = "approved",
): { id: number; name: string } {
  const resolved = resolveTagName(db, raw);
  if (!resolved.name) throw new Error("tag name required");
  if (resolved.id !== null) return { id: resolved.id, name: resolved.name };
  const info = db
    .prepare("INSERT INTO tags (name, review_state) VALUES (?, ?)")
    .run(resolved.name, initialReviewState);
  return { id: info.lastInsertRowid as number, name: resolved.name };
}

/**
 * The given tags together with everything under them. The recursion uses
 * UNION rather than UNION ALL, so a cycle introduced outside these helpers
 * terminates instead of hanging the request.
 */
export function withDescendants(
  db: Database.Database,
  ids: number[],
): number[] {
  if (ids.length === 0) return [];
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM tags WHERE id IN (${ids.map(() => "?").join(",")})
         UNION
         SELECT t.id FROM tags t JOIN sub ON t.parent_id = sub.id
       )
       SELECT id FROM sub`,
    )
    .all(...ids) as { id: number }[];
  return rows.map((r) => r.id);
}

/** The names a tag answers to, apart from its own. */
export function aliasesOf(db: Database.Database, tagId: number): string[] {
  return (
    db
      .prepare("SELECT alias FROM tag_aliases WHERE tag_id = ? ORDER BY alias")
      .all(tagId) as { alias: string }[]
  ).map((r) => r.alias);
}

export type TagRow = { id: number; name: string; parent_id: number | null };

/**
 * Every tag's ancestors, root first, ending in the tag itself. Read in one
 * pass and walked in memory: a page showing a dozen tags would otherwise issue
 * a dozen recursive queries, and the table is small enough to hold.
 */
export function loadTagPaths(db: Database.Database): Map<number, string[]> {
  const rows = db
    .prepare("SELECT id, name, parent_id FROM tags")
    .all() as TagRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const paths = new Map<number, string[]>();

  for (const row of rows) {
    const path: string[] = [];
    let current: TagRow | undefined = row;
    // A cycle would loop forever; the depth cap ends it and the path stays
    // usable, which matters more here than being exactly right.
    for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
      path.unshift(current.name);
      current =
        current.parent_id === null ? undefined : byId.get(current.parent_id);
    }
    paths.set(row.id, path);
  }
  return paths;
}

/**
 * One tag's ancestors, root first, ending in the tag itself. For a handful of
 * tags at a time; use loadTagPaths when the whole table is wanted.
 */
export function tagPath(db: Database.Database, id: number): string[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE up(id, name, parent_id, depth) AS (
         SELECT id, name, parent_id, 0 FROM tags WHERE id = ?
         UNION ALL
         SELECT t.id, t.name, t.parent_id, up.depth + 1
         FROM tags t JOIN up ON t.id = up.parent_id
         WHERE up.depth < ${MAX_DEPTH}
       )
       SELECT name FROM up ORDER BY depth DESC`,
    )
    .all(id) as { name: string }[];
  return rows.map((r) => r.name);
}

/** True when `parentId` sits inside `tagId`'s own subtree, or is the tag. */
export function wouldCycle(
  db: Database.Database,
  tagId: number,
  parentId: number | null,
): boolean {
  if (parentId === null) return false;
  if (parentId === tagId) return true;
  return withDescendants(db, [tagId]).includes(parentId);
}

/**
 * The whole tag table as a tree, counted and sorted, for the management page.
 *
 * Assembled in memory rather than by recursive query: the counts have to roll
 * up the tree anyway, and doing that here keeps one description of what a
 * parent's number means.
 */
export function loadTagTree(db: Database.Database): TagTreeNode[] {
  const rows = db
    .prepare("SELECT id, name, parent_id, assignable, review_state FROM tags")
    .all() as (TagRow & {
    assignable: number;
    review_state: TagReviewState;
  })[];

  const counts = new Map<number, number>();
  for (const row of db
    .prepare(
      "SELECT tag_id, COUNT(*) AS c FROM video_tags WHERE status = 'active' GROUP BY tag_id",
    )
    .all() as { tag_id: number; c: number }[]) {
    counts.set(row.tag_id, row.c);
  }

  const sources = new Map<number, string[]>();
  for (const row of db
    .prepare(
      "SELECT tag_id, source FROM video_tags WHERE status = 'active' GROUP BY tag_id, source",
    )
    .all() as { tag_id: number; source: string }[]) {
    const list = sources.get(row.tag_id);
    if (list) list.push(row.source);
    else sources.set(row.tag_id, [row.source]);
  }

  const rejected = new Set(
    (
      db
        .prepare(
          "SELECT DISTINCT tag_id FROM video_tags WHERE status = 'rejected'",
        )
        .all() as { tag_id: number }[]
    ).map((row) => row.tag_id),
  );

  const aliases = new Map<number, string[]>();
  for (const row of db
    .prepare("SELECT tag_id, alias FROM tag_aliases ORDER BY alias")
    .all() as { tag_id: number; alias: string }[]) {
    const list = aliases.get(row.tag_id);
    if (list) list.push(row.alias);
    else aliases.set(row.tag_id, [row.alias]);
  }

  const nodes = new Map<number, TagTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      sources: sources.get(row.id) ?? [],
      rejected: rejected.has(row.id),
      assignable: row.assignable !== 0,
      reviewState: row.review_state,
      count: counts.get(row.id) ?? 0,
      totalCount: 0,
      aliases: aliases.get(row.id) ?? [],
      children: [],
    });
  }

  const roots: TagTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent =
      node.parentId === null ? null : (nodes.get(node.parentId) ?? null);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // A cycle has no root, so its members would never be drawn. Nothing in the
  // API can create one, but a tag that cannot be seen also cannot be repaired,
  // so anything unreached is shown at the top level instead of dropped.
  const reached = new Set<number>();
  const walk = (node: TagTreeNode, depth: number) => {
    if (reached.has(node.id) || depth > MAX_DEPTH) return;
    reached.add(node.id);
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  for (const node of nodes.values()) {
    if (!reached.has(node.id)) {
      roots.push(node);
      walk(node, 0);
    }
  }

  // A video tagged with both a parent and its child must count once against
  // the parent, so the subtree total is a distinct count rather than a sum.
  // Only tags that have children need asking; for a leaf the two are the same
  // number.
  const distinct = db.prepare(
    "SELECT COUNT(DISTINCT video_id) AS c FROM video_tags WHERE status = 'active' AND tag_id IN (SELECT value FROM json_each(?))",
  );
  const rollUp = (node: TagTreeNode, depth: number): number[] => {
    node.children.sort((a, b) => compareNames(a.name, b.name));
    const subtree = [node.id];
    if (depth <= MAX_DEPTH) {
      for (const child of node.children)
        subtree.push(...rollUp(child, depth + 1));
    }
    node.totalCount =
      node.children.length === 0
        ? node.count
        : (distinct.get(JSON.stringify(subtree)) as { c: number }).c;
    return subtree;
  };
  for (const root of roots) rollUp(root, 0);

  roots.sort((a, b) => compareNames(a.name, b.name));
  return roots;
}

/** Every node of a tree, depth first, as one list. */
export function flattenTree(nodes: TagTreeNode[]): TagTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/**
 * Folds tags into one, keeping their names reachable as aliases of it.
 *
 * This is how a library that grew several spellings of one idea separately
 * becomes one tag: the videos move onto the target, the old names become
 * spellings of it, and a search for any of them still lands in the same place.
 *
 * Every source disappears as a tag, so nothing is left carrying an old name.
 */
export function mergeTags(
  db: Database.Database,
  sourceIds: number[],
  targetId: number,
): { merged: number; aliases: string[] } {
  const target = db
    .prepare("SELECT id, name FROM tags WHERE id = ?")
    .get(targetId) as { id: number; name: string } | undefined;
  if (!target) throw new Error("目标标签不存在。");

  const aliases: string[] = [];
  let merged = 0;

  const tx = db.transaction(() => {
    for (const sourceId of sourceIds) {
      if (sourceId === targetId) continue;
      const source = db
        .prepare("SELECT id, name, parent_id, clicks FROM tags WHERE id = ?")
        .get(sourceId) as
        | { id: number; name: string; parent_id: number | null; clicks: number }
        | undefined;
      if (!source) continue;

      // Merging a parent into one of its own children would leave that child
      // pointing at itself once the other children move across. Lifting the
      // target to the parent's place first keeps the tree intact.
      if (withDescendants(db, [sourceId]).includes(targetId)) {
        db.prepare("UPDATE tags SET parent_id = ? WHERE id = ?").run(
          source.parent_id,
          targetId,
        );
      }
      db.prepare("UPDATE tags SET parent_id = ? WHERE parent_id = ?").run(
        targetId,
        sourceId,
      );

      // A video already carrying both keeps the stronger of the two rows: a
      // tag the user vouched for is not demoted to a generated one, and one
      // they still hold is not turned into a rejection.
      const links = db
        .prepare(
          "SELECT video_id, source, status FROM video_tags WHERE tag_id = ?",
        )
        .all(sourceId) as {
        video_id: number;
        source: string;
        status: string;
      }[];
      const existing = db.prepare(
        "SELECT source, status FROM video_tags WHERE video_id = ? AND tag_id = ?",
      );
      const insert = db.prepare(
        "INSERT INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, ?, ?)",
      );
      const update = db.prepare(
        "UPDATE video_tags SET source = ?, status = ? WHERE video_id = ? AND tag_id = ?",
      );
      for (const link of links) {
        const held = existing.get(link.video_id, targetId) as
          { source: string; status: string } | undefined;
        if (!held) {
          insert.run(link.video_id, targetId, link.source, link.status);
          continue;
        }
        const source_ =
          held.source === "manual" || link.source === "manual"
            ? "manual"
            : held.source;
        const status =
          held.status === "active" || link.status === "active"
            ? "active"
            : held.status;
        update.run(source_, status, link.video_id, targetId);
      }

      // The source's own aliases follow it, and the source's name joins them.
      // The tag has to go first: a name cannot be an alias while it is still a
      // tag, which is the rule the triggers in lib/db.ts enforce.
      db.prepare("UPDATE tag_aliases SET tag_id = ? WHERE tag_id = ?").run(
        targetId,
        sourceId,
      );
      db.prepare("UPDATE tags SET clicks = clicks + ? WHERE id = ?").run(
        source.clicks,
        targetId,
      );
      db.prepare("DELETE FROM tags WHERE id = ?").run(sourceId);
      db.prepare(
        "INSERT OR IGNORE INTO tag_aliases (alias, tag_id) VALUES (?, ?)",
      ).run(source.name, targetId);

      aliases.push(source.name);
      merged++;
    }
  });
  tx();

  return { merged, aliases };
}

export type QueryExpansion = {
  /** Spellings to match against titles, filenames and series names. */
  names: string[];
  /** The tag the query named, plus its subtree. Empty when it named none. */
  tagIds: number[];
};

/**
 * Widens a search term into everything it should reach.
 *
 * Searching an alias finds videos whose title carries that spelling, videos
 * whose title carries the canonical name, and videos tagged with the tag.
 * Every spelling of a tag is equivalent, so searching any one of them returns
 * the same videos.
 */
export function expandQuery(db: Database.Database, q: string): QueryExpansion {
  const typed = q.trim();
  const names = new Set<string>();
  if (typed) names.add(typed);

  const resolved = resolveTagName(db, typed);
  if (resolved.id === null) return { names: [...names], tagIds: [] };

  names.add(resolved.name);
  for (const alias of aliasesOf(db, resolved.id)) names.add(alias);
  return { names: [...names], tagIds: withDescendants(db, [resolved.id]) };
}
