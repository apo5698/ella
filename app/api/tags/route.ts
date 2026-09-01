import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  flattenTree,
  loadTagTree,
  normalizeTagName,
  resolveTagName,
} from "@/lib/tagHierarchy";

/**
 * The tags shown as filter chips. The number is the whole subtree, matching
 * what selecting the chip returns: a parent reports the videos tagged with
 * any of its children too.
 */
export async function GET() {
  const tags = flattenTree(loadTagTree(db))
    .map((node) => ({
      id: node.id,
      name: node.name,
      count: node.totalCount,
      reviewState: node.reviewState,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return NextResponse.json({ tags });
}

/** Creates a tag, optionally under a parent. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = normalizeTagName(String(body.name ?? ""));
  if (!name) {
    return NextResponse.json({ error: "请输入标签名称。" }, { status: 400 });
  }

  const existing = resolveTagName(db, name);
  if (existing.id !== null) {
    return NextResponse.json(
      {
        error: existing.alias
          ? `"${existing.alias}"已是标签"${existing.name}"的别名。`
          : `标签"${existing.name}"已存在。`,
      },
      { status: 409 },
    );
  }

  const parentId =
    body.parentId === null || body.parentId === undefined
      ? null
      : Number(body.parentId);
  if (
    parentId !== null &&
    !db.prepare("SELECT 1 FROM tags WHERE id = ?").get(parentId)
  ) {
    return NextResponse.json({ error: "父标签不存在。" }, { status: 400 });
  }

  const info = db
    .prepare("INSERT INTO tags (name, parent_id) VALUES (?, ?)")
    .run(name, parentId);
  return NextResponse.json({ id: info.lastInsertRowid, name, parentId });
}
