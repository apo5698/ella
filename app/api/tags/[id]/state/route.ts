import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { directActiveVideoCount } from "@/lib/tagHierarchy";
import type { TagReviewState } from "@/lib/types";

const WRITABLE_STATES = new Set<TagReviewState>([
  "excluded",
  "approved",
  "category",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tagId = Number((await params).id);
  const tag = db
    .prepare("SELECT review_state FROM tags WHERE id = ?")
    .get(tagId) as { review_state: TagReviewState } | undefined;
  if (!tag) {
    return NextResponse.json({ error: "标签不存在" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { state?: unknown };
  const state = body.state as TagReviewState;
  if (state === "automatic" && tag.review_state === "automatic") {
    return NextResponse.json({ ok: true, state });
  }
  if (!WRITABLE_STATES.has(state)) {
    return NextResponse.json(
      { error: "自动状态只能由自动识别产生" },
      { status: 400 },
    );
  }

  if (state === "category") {
    const directCount = directActiveVideoCount(db, tagId);
    if (directCount > 0) {
      return NextResponse.json(
        { error: `${directCount} 个视频仍直接使用该标签，请先移除或改用子标签` },
        { status: 409 },
      );
    }
  }

  db.transaction(() => {
    if (state === "excluded") {
      db.prepare(
        "UPDATE video_tags SET status = 'rejected' WHERE tag_id = ? AND status = 'active'",
      ).run(tagId);
      db.prepare(
        "UPDATE tags SET assignable = 1, review_state = 'excluded' WHERE id = ?",
      ).run(tagId);
      return;
    }

    if (state === "approved") {
      if (tag.review_state === "excluded") {
        db.prepare(
          "UPDATE video_tags SET source = 'manual', status = 'active' WHERE tag_id = ?",
        ).run(tagId);
      } else if (tag.review_state === "automatic") {
        db.prepare(
          `UPDATE video_tags SET source = 'manual'
           WHERE tag_id = ? AND status = 'active'`,
        ).run(tagId);
      }
      db.prepare(
        "UPDATE tags SET assignable = 1, review_state = 'approved' WHERE id = ?",
      ).run(tagId);
      return;
    }

    db.prepare(
      "UPDATE tags SET assignable = 0, review_state = 'category' WHERE id = ?",
    ).run(tagId);
  })();

  return NextResponse.json({ ok: true, state });
}
