import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { enqueueTagPromotion } from "@/lib/taskRunner";

/**
 * Promotes a generated tag to a manual one. Accepted tags are treated as
 * ground truth: they survive re-generation and steer future prompts.
 *
 * Accepting is a statement about the tag rather than about this one video, so
 * the tag's remaining generated associations are promoted too. That can touch
 * many videos, so it is queued rather than done inside this request.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "")
    .trim()
    .toLowerCase();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const info = db
    .prepare(
      `UPDATE video_tags SET source = 'manual', status = 'active'
       WHERE video_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)`,
    )
    .run(Number(id), name);

  if (info.changes === 0) {
    return NextResponse.json(
      { ok: false, error: "标签不存在" },
      { status: 404 },
    );
  }

  const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as
    { id: number } | undefined;
  const taskId = tag ? enqueueTagPromotion(db, tag.id) : null;

  return NextResponse.json({ ok: true, name, taskId });
}
