import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureTag, isAssignableTag, resolveTagName } from "@/lib/tagHierarchy";

type BatchAction = "add" | "remove";

/** Applies the same tag change to a selection of videos in one transaction. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids)
    ? [
        ...new Set<number>(
          body.ids
            .map(Number)
            .filter((id: number) => Number.isInteger(id) && id > 0),
        ),
      ]
    : [];
  const names: string[] = Array.isArray(body.names)
    ? [
        ...new Set<string>(
          body.names
            .map((name: unknown) => String(name).trim())
            .filter((name: string) => name.length > 0),
        ),
      ]
    : [];
  const action = body.action as BatchAction;

  if (ids.length === 0) {
    return NextResponse.json({ error: "请选择视频。" }, { status: 400 });
  }
  if (names.length === 0) {
    return NextResponse.json({ error: "请选择标签。" }, { status: 400 });
  }
  if (action !== "add" && action !== "remove") {
    return NextResponse.json({ error: "批量操作无效。" }, { status: 400 });
  }

  // Refused whole rather than half applied: a selection that names a grouping
  // tag is a mistake worth reporting, not a partial write to undo.
  if (action === "add") {
    for (const name of names) {
      const tag = resolveTagName(db, name);
      if (tag.id !== null && !isAssignableTag(db, tag.id)) {
        return NextResponse.json(
          { error: `"${tag.name}"是分类标签，请改用其下的子标签` },
          { status: 400 },
        );
      }
    }
  }

  const canonicalNames = new Set<string>();
  const tx = db.transaction(() => {
    if (action === "add") {
      const upsert = db.prepare(
        `INSERT INTO video_tags (video_id, tag_id, source, status)
         VALUES (?, ?, 'manual', 'active')
         ON CONFLICT(video_id, tag_id)
         DO UPDATE SET source = 'manual', status = 'active'`,
      );
      const tags = names.map((name) => ensureTag(db, name));
      for (const tag of tags) {
        canonicalNames.add(tag.name);
        for (const videoId of ids) upsert.run(videoId, tag.id);
      }
      return;
    }

    const findLink = db.prepare(
      "SELECT source FROM video_tags WHERE video_id = ? AND tag_id = ?",
    );
    const removeManual = db.prepare(
      "DELETE FROM video_tags WHERE video_id = ? AND tag_id = ?",
    );
    const rejectGenerated = db.prepare(
      "UPDATE video_tags SET status = 'rejected' WHERE video_id = ? AND tag_id = ?",
    );

    for (const name of names) {
      const tag = resolveTagName(db, name);
      if (tag.id === null) continue;
      canonicalNames.add(tag.name);
      for (const videoId of ids) {
        const link = findLink.get(videoId, tag.id) as
          { source: string } | undefined;
        if (!link) continue;
        if (link.source === "manual") removeManual.run(videoId, tag.id);
        else rejectGenerated.run(videoId, tag.id);
      }
    }
  });

  tx();
  return NextResponse.json({
    ok: true,
    action,
    videoCount: ids.length,
    names: [...canonicalNames],
  });
}
