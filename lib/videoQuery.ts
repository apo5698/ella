import type Database from "better-sqlite3";
import { expandQuery, withDescendants } from "@/lib/tagHierarchy";
import { matchesPinyinSearch, normalizeSearchText } from "@/lib/pinyinSearch";

// "newest"/"oldest" sort by the video file's own mtime (its actual creation/
// download date), not `created_at` (when the row was scanned into the DB —
// meaningless here since a full scan inserts hundreds of rows within seconds).
const SORT_OPTIONS: Record<string, string> = {
  views: "v.views DESC, v.mtime DESC, v.duration_sec DESC",
  newest: "v.mtime DESC, v.views DESC",
  oldest: "v.mtime ASC, v.views DESC",
  duration_desc: "v.duration_sec DESC, v.mtime DESC",
  duration_asc: "v.duration_sec ASC, v.mtime DESC",
  title: "v.title ASC",
  title_asc: "v.title ASC, v.id ASC",
  title_desc: "v.title DESC, v.id DESC",
  size_desc: "v.size_bytes DESC, v.mtime DESC",
  size_asc: "v.size_bytes ASC, v.mtime DESC",
  clicks_desc: "v.clicks DESC, v.mtime DESC",
  clicks_asc: "v.clicks ASC, v.mtime DESC",
  views_desc: "v.views DESC, v.mtime DESC",
  views_asc: "v.views ASC, v.mtime DESC",
};

/** What narrows and orders a video list, as it travels in a URL. */
export type VideoListParams = {
  q: string;
  tagIds: number[];
  /** Match the tags themselves only, not the tags beneath them. */
  directTags: boolean;
  /** A series id, "none" for videos without one, or "" for any. */
  series: string;
  sort: string;
  /** Only these videos, when given. */
  ids: number[];
};

export function parseVideoListParams(
  searchParams: URLSearchParams,
  defaultSort = "views",
): VideoListParams {
  return {
    q: searchParams.get("q")?.trim() ?? "",
    tagIds: (searchParams.get("tags") ?? "")
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)),
    directTags: searchParams.get("tagMode") === "direct",
    series: searchParams.get("series") ?? "",
    sort: searchParams.get("sort") ?? defaultSort,
    ids: (searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n))
      .slice(0, 100),
  };
}

/**
 * The FROM, WHERE and ORDER BY shared by every view of the list, so a page of
 * it and the neighbours of one video in it always agree.
 */
export function videoListQuery(db: Database.Database, list: VideoListParams) {
  const { q, tagIds, directTags } = list;
  const seriesId = parseInt(list.series, 10);
  const orderBy = SORT_OPTIONS[list.sort] ?? SORT_OPTIONS.views;
  const from = "videos v LEFT JOIN series s ON s.id = v.series_id";
  let where = "1=1";
  const params: (string | number)[] = [];

  if (q) {
    // Searching a tag reaches everything that tag stands for: its own
    // spellings in a title, and its whole subtree in the tag list. See
    // lib/tagHierarchy.ts.
    const { names, tagIds: queryTagIds } = expandQuery(db, q);
    const clauses: string[] = [];
    for (const name of names) {
      clauses.push(
        "v.title LIKE ?",
        "v.filename LIKE ?",
        "v.path LIKE ?",
        "s.name LIKE ?",
      );
      params.push(`%${name}%`, `%${name}%`, `%${name}%`, `%${name}%`);
    }
    // A partial word still matches tags by substring, as it always has.
    clauses.push(`v.id IN (
      SELECT vt.video_id FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
      WHERE t.name LIKE ? AND vt.status = 'active'
    )`);
    params.push(`%${q}%`);
    if (queryTagIds.length > 0) {
      clauses.push(`v.id IN (
        SELECT video_id FROM video_tags
        WHERE tag_id IN (${queryTagIds.map(() => "?").join(",")}) AND status = 'active'
      )`);
      params.push(...queryTagIds);
    }

    // SQLite has no pinyin collation that can transliterate text for LIKE.
    // Resolve Latin pinyin against the searchable text in memory, then feed
    // only the matching ids back into the same SQL query.
    if (/[a-z]/i.test(q)) {
      const normalizedQuery = normalizeSearchText(q);
      const matchingVideoIds = (
        db
          .prepare(
            `SELECT v.id, v.title, v.filename, s.name AS series_name
             FROM videos v LEFT JOIN series s ON s.id = v.series_id`,
          )
          .all() as {
          id: number;
          title: string;
          filename: string;
          series_name: string | null;
        }[]
      )
        .filter((video) =>
          [video.title, video.filename, video.series_name]
            .filter((value): value is string => Boolean(value))
            .some((value) => matchesPinyinSearch(value, normalizedQuery)),
        )
        .map((video) => video.id);

      const matchingTagIds = new Set<number>();
      for (const row of db
        .prepare(
          `SELECT t.id, t.name AS text FROM tags t
           UNION ALL
           SELECT a.tag_id AS id, a.alias AS text FROM tag_aliases a`,
        )
        .all() as { id: number; text: string }[]) {
        if (matchesPinyinSearch(row.text, normalizedQuery))
          matchingTagIds.add(row.id);
      }
      const matchingFamilyIds = withDescendants(db, [...matchingTagIds]);

      if (matchingVideoIds.length > 0) {
        clauses.push(`v.id IN (${matchingVideoIds.map(() => "?").join(",")})`);
        params.push(...matchingVideoIds);
      }
      if (matchingFamilyIds.length > 0) {
        clauses.push(`v.id IN (
          SELECT video_id FROM video_tags
          WHERE tag_id IN (${matchingFamilyIds.map(() => "?").join(",")})
            AND status = 'active'
        )`);
        params.push(...matchingFamilyIds);
      }
    }
    where += ` AND (${clauses.join(" OR ")})`;
  }
  if (Number.isFinite(seriesId)) {
    where += " AND v.series_id = ?";
    params.push(seriesId);
  } else if (list.series === "none") {
    where += " AND v.series_id IS NULL";
  }
  if (list.ids.length > 0) {
    where += ` AND v.id IN (${list.ids.map(() => "?").join(",")})`;
    params.push(...list.ids);
  }
  // One clause per selected tag, so several chips still narrow rather than
  // widen. Each is satisfied by the tag itself or by any tag beneath it.
  for (const tagId of tagIds) {
    const family = directTags ? [tagId] : withDescendants(db, [tagId]);
    if (family.length === 0) continue;
    where += ` AND v.id IN (
      SELECT video_id FROM video_tags
      WHERE tag_id IN (${family.map(() => "?").join(",")}) AND status = 'active'
    )`;
    params.push(...family);
  }

  return { from, where, params, orderBy };
}

export type VideoNeighbours = {
  previous: number | null;
  next: number | null;
  /** 1-based place in the list, or null when the video is not in it. */
  position: number | null;
  total: number;
};

/** Where one video sits in a list, and the videos on either side of it. */
export function videoNeighbours(
  db: Database.Database,
  list: VideoListParams,
  videoId: number,
): VideoNeighbours {
  const { from, where, params, orderBy } = videoListQuery(db, list);
  // Ids only. Even a large library is a few thousand integers, and walking
  // the ordered list is the one way ties resolve exactly as a page does.
  const ids = (
    db
      .prepare(`SELECT v.id FROM ${from} WHERE ${where} ORDER BY ${orderBy}`)
      .all(...params) as { id: number }[]
  ).map((row) => row.id);
  const index = ids.indexOf(videoId);
  if (index === -1)
    return { previous: null, next: null, position: null, total: ids.length };
  return {
    previous: ids[index - 1] ?? null,
    next: ids[index + 1] ?? null,
    position: index + 1,
    total: ids.length,
  };
}
