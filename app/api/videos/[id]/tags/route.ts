import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  ensureTag,
  isAssignableTag,
  resolveTagName,
  tagPath,
} from "@/lib/tagHierarchy";
import { enqueueTagPromotion } from "@/lib/taskRunner";

/**
 * Adds a tag to a video. The name is resolved first, so an alias stores the
 * tag it stands for: a video never carries an alias.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = String(body.name ?? "");
  const resolved = resolveTagName(db, raw);
  if (!resolved.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // A tag that only groups others is refused here rather than silently
  // dropped: the request named it, and its children are what to use instead.
  if (resolved.id !== null && !isAssignableTag(db, resolved.id)) {
    return NextResponse.json(
      { error: `"${resolved.name}"是分类标签，请改用其下的子标签` },
      { status: 400 },
    );
  }

  const videoId = Number(id);
  let tagId = resolved.id;
  const tx = db.transaction(() => {
    const tag = ensureTag(db, raw);
    tagId = tag.id;
    db.prepare(
      "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, 'manual', 'active')",
    ).run(videoId, tag.id);
    // Adding a tag the user had previously rejected (or one that exists as a
    // generated tag) promotes it to an active manual tag.
    db.prepare(
      "UPDATE video_tags SET source = 'manual', status = 'active' WHERE video_id = ? AND tag_id = ?",
    ).run(videoId, tag.id);
  });
  tx();

  // Adding a tag by hand vouches for the word itself, so the tag stops being
  // a generated one everywhere. Queued: it can touch many videos.
  const taskId = tagId === null ? null : enqueueTagPromotion(db, tagId);

  return NextResponse.json({
    ok: true,
    id: tagId,
    name: resolved.name,
    taskId,
    // Returned so the editor can place the new chip in its family without
    // reloading the page.
    path: tagPath(db, tagId as number),
    alias: resolved.alias,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const resolved = resolveTagName(db, searchParams.get("name") ?? "");
  if (!resolved.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const videoId = Number(id);

  const link = db
    .prepare(
      `SELECT vt.tag_id, vt.source FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
       WHERE vt.video_id = ? AND t.name = ?`,
    )
    .get(videoId, resolved.name) as
    { tag_id: number; source: string } | undefined;

  if (!link) return NextResponse.json({ ok: true });

  if (link.source === "manual") {
    // The user added it themselves, so removing it is a plain undo.
    db.prepare("DELETE FROM video_tags WHERE video_id = ? AND tag_id = ?").run(
      videoId,
      link.tag_id,
    );
    return NextResponse.json({ ok: true, status: "deleted" });
  }

  // Generated tag: keep the row as a negative signal for future re-generation.
  db.prepare(
    "UPDATE video_tags SET status = 'rejected' WHERE video_id = ? AND tag_id = ?",
  ).run(videoId, link.tag_id);
  return NextResponse.json({ ok: true, status: "rejected" });
}
