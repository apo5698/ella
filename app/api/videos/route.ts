import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { expandQuery, withDescendants } from "@/lib/tagHierarchy";
import { matchesPinyinSearch, normalizeSearchText } from "@/lib/pinyinSearch";

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 100;

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
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const tagIds = (searchParams.get("tags") ?? "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const directTags = searchParams.get("tagMode") === "direct";
  const seriesParam = searchParams.get("series") ?? "";
  const seriesId = parseInt(seriesParam, 10);
  const groupBySeries = searchParams.get("groupBy") === "series";
  const sort = searchParams.get("sort") ?? "views";
  const orderBy = SORT_OPTIONS[sort] ?? SORT_OPTIONS.views;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const requestedPageSize = parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize))
    : DEFAULT_PAGE_SIZE;

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
  } else if (seriesParam === "none") {
    where += " AND v.series_id IS NULL";
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

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM ${from} WHERE ${where}`)
      .get(...params) as {
      c: number;
    }
  ).c;

  if (groupBySeries) {
    const groups = db
      .prepare(
        `SELECT v.series_id AS id, s.name, COUNT(*) AS videoCount
         FROM ${from}
         WHERE ${where}
         GROUP BY v.series_id, s.name
         ORDER BY (v.series_id IS NOT NULL), s.name COLLATE NOCASE`,
      )
      .all(...params) as {
      id: number | null;
      name: string | null;
      videoCount: number;
    }[];

    return NextResponse.json({
      groups: groups.map((group) => ({
        ...group,
        name: group.name ?? "未设置系列",
      })),
      total,
    });
  }

  const rows = db
    .prepare(
      `SELECT v.*, s.name AS series_name
       FROM ${from}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Record<
    string,
    unknown
  >[];

  // Manual tags outrank generated ones, so the few tags shown on a card are
  // the ones the user vouched for.
  const tagStmt = db.prepare(
    `SELECT t.id, t.name, vt.source FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
     WHERE vt.video_id = ? AND vt.status = 'active'
     ORDER BY (vt.source = 'manual') DESC, t.clicks DESC, t.name ASC`,
  );

  const videos = rows.map((r) => ({
    ...r,
    tags: tagStmt.all(r.id as number) as {
      id: number;
      name: string;
      source: string;
    }[],
  }));

  return NextResponse.json({ videos, total, page, pageSize });
}
