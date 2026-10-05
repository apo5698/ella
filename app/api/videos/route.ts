import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { PREVIEW_CLIP_COLUMN } from "@/lib/videoCardRows";
import { parseVideoListParams, videoListQuery } from "@/lib/videoQuery";

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const list = parseVideoListParams(searchParams);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const requestedPageSize = parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize))
    : DEFAULT_PAGE_SIZE;

  const { from, where, params, orderBy } = videoListQuery(db, list);

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM ${from} WHERE ${where}`)
      .get(...params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT v.*, s.name AS series_name, ${PREVIEW_CLIP_COLUMN}
       FROM ${from}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Record<
    string,
    unknown
  >[];

  // Put the library's most-used tags first so the three shown in the manager
  // are the most representative ones for each video.
  const tagStmt = db.prepare(
    `SELECT t.id, t.name, vt.source FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
     WHERE vt.video_id = ? AND vt.status = 'active'
     ORDER BY (
       SELECT COUNT(*) FROM video_tags usage
       WHERE usage.tag_id = t.id AND usage.status = 'active'
     ) DESC, t.name ASC`,
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
