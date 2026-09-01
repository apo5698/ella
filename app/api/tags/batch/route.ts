import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { wouldCycle } from "@/lib/tagHierarchy";

/**
 * Applies one change to many tags at once. Merging has its own route, since it
 * rewrites video links rather than just moving tags about.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Number.isFinite)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "请选择标签。" }, { status: 400 });
  }

  if (body.action === "delete") {
    const tx = db.transaction(() => {
      for (const id of ids) {
        const tag = db
          .prepare("SELECT parent_id FROM tags WHERE id = ?")
          .get(id) as { parent_id: number | null } | undefined;
        if (!tag) continue;
        // Children move up rather than going with the parent, as they do for a
        // single delete.
        db.prepare("UPDATE tags SET parent_id = ? WHERE parent_id = ?").run(
          tag.parent_id,
          id,
        );
        db.prepare("DELETE FROM tags WHERE id = ?").run(id);
      }
    });
    tx();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  // Excluding is the video page's tag removal applied to a whole tag: the link
  // is kept as a rejection, which is what stops re-generation from restoring
  // it. Nothing is deleted, so "restore" is a true inverse of one run of this.
  if (body.action === "exclude" || body.action === "restore") {
    const [from, to] =
      body.action === "exclude"
        ? ["active", "rejected"]
        : ["rejected", "active"];
    let changed = 0;
    db.transaction(() => {
      const info = db
        .prepare(
          `UPDATE video_tags SET status = ?
           WHERE tag_id IN (${ids.map(() => "?").join(",")}) AND status = ?`,
        )
        .run(to, ...ids, from);
      changed = info.changes;

      if (body.action === "exclude") {
        db.prepare(
          `UPDATE tags SET assignable = 1, review_state = 'excluded'
           WHERE id IN (${ids.map(() => "?").join(",")})`,
        ).run(...ids);
      } else {
        const restoreState = db.prepare(
          `UPDATE tags
           SET assignable = 1,
               review_state = CASE
                 WHEN EXISTS (
                   SELECT 1 FROM video_tags vt
                   WHERE vt.tag_id = tags.id
                     AND vt.source = 'manual'
                     AND vt.status = 'active'
                 ) THEN 'approved'
                 WHEN EXISTS (
                   SELECT 1 FROM video_tags vt
                   WHERE vt.tag_id = tags.id
                     AND vt.source = 'vision'
                     AND vt.status = 'active'
                 ) THEN 'automatic'
                 ELSE 'approved'
               END
           WHERE id = ?`,
        );
        for (const id of ids) restoreState.run(id);
      }
    })();
    return NextResponse.json({ ok: true, count: changed });
  }

  if (body.action === "setParent") {
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

    // A selection that includes the chosen parent, or anything above it, is
    // refused whole rather than half applied: a partial move would leave the
    // page showing something the user did not ask for.
    for (const id of ids) {
      if (parentId !== null && wouldCycle(db, id, parentId)) {
        const name = (
          db.prepare("SELECT name FROM tags WHERE id = ?").get(id) as
            { name: string } | undefined
        )?.name;
        return NextResponse.json(
          { error: `"${name ?? id}"不能移动到自身或其子标签下。` },
          { status: 400 },
        );
      }
    }

    const tx = db.transaction(() => {
      for (const id of ids) {
        db.prepare("UPDATE tags SET parent_id = ? WHERE id = ?").run(
          parentId,
          id,
        );
      }
    });
    tx();
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "未知操作。" }, { status: 400 });
}
