import { getTranslations } from "next-intl/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  directActiveVideoCount,
  normalizeTagName,
  resolveTagName,
  withDescendants,
  wouldCycle,
} from "@/lib/tagHierarchy";
import type { TagReviewState } from "@/lib/types";
import { notifyVideosChanged } from "@/lib/videoEvents";

type Body = { name?: unknown; parentId?: unknown; assignable?: unknown };

/** The five most-viewed active videos returned by filtering on this tag. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) {
    return NextResponse.json({ error: t("tagMissing") }, { status: 404 });
  }

  const tag = db.prepare("SELECT id FROM tags WHERE id = ?").get(tagId);
  if (!tag)
    return NextResponse.json({ error: t("tagMissing") }, { status: 404 });

  const videos = db
    .prepare(
      `SELECT v.id, v.title, v.thumbnail, v.views
       FROM videos v
       JOIN video_tags vt ON vt.video_id = v.id
       WHERE vt.tag_id IN (SELECT value FROM json_each(?))
         AND vt.status = 'active'
       GROUP BY v.id
       ORDER BY v.views DESC, v.id DESC
       LIMIT 5`,
    )
    .all(JSON.stringify(withDescendants(db, [tagId])));

  return NextResponse.json({ videos });
}

/** Renames a tag, moves it under another, or changes what it may be used for. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const tagId = Number(id);
  const tag = db
    .prepare(
      "SELECT id, name, parent_id, assignable, review_state FROM tags WHERE id = ?",
    )
    .get(tagId) as
    | {
        id: number;
        name: string;
        parent_id: number | null;
        assignable: number;
        review_state: TagReviewState;
      }
    | undefined;
  if (!tag)
    return NextResponse.json({ error: t("tagMissing") }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;

  let name = tag.name;
  if (body.name !== undefined) {
    name = normalizeTagName(String(body.name));
    if (!name)
      return NextResponse.json(
        { error: t("tagNameRequired") },
        { status: 400 },
      );
    const clash = resolveTagName(db, name);
    if (clash.id !== null && clash.id !== tagId) {
      return NextResponse.json(
        {
          error: clash.alias
            ? t("aliasExists", { alias: clash.alias ?? "", name: clash.name })
            : t("tagExists", { name: clash.name }),
        },
        { status: 409 },
      );
    }
  }

  let parentId = tag.parent_id;
  if (body.parentId !== undefined) {
    parentId = body.parentId === null ? null : Number(body.parentId);
    if (
      parentId !== null &&
      !db.prepare("SELECT 1 FROM tags WHERE id = ?").get(parentId)
    ) {
      return NextResponse.json({ error: t("parentMissing") }, { status: 400 });
    }
    // A tag cannot sit inside its own subtree: the result would be a ring with
    // no root, unreachable from the tree the page draws.
    if (wouldCycle(db, tagId, parentId)) {
      return NextResponse.json({ error: t("invalidParent") }, { status: 400 });
    }
  }

  const assignable =
    body.assignable === undefined
      ? tag.assignable !== 0
      : body.assignable !== false;
  const reviewState =
    body.assignable === undefined
      ? tag.review_state
      : assignable
        ? tag.review_state === "category"
          ? "approved"
          : tag.review_state
        : "category";

  if (tag.assignable !== 0 && !assignable) {
    const directVideoCount = directActiveVideoCount(db, tagId);
    if (directVideoCount > 0) {
      return NextResponse.json(
        {
          error: t("categoryAssigned", { count: directVideoCount }),
        },
        { status: 409 },
      );
    }
  }

  db.prepare(
    "UPDATE tags SET name = ?, parent_id = ?, assignable = ?, review_state = ? WHERE id = ?",
  ).run(name, parentId, assignable ? 1 : 0, reviewState, tagId);
  notifyVideosChanged();
  return NextResponse.json({
    id: tagId,
    name,
    parentId,
    assignable,
    reviewState,
  });
}

/**
 * Removes a tag from the library and from every video carrying it. Its
 * children move up to its parent rather than being deleted with it: they are
 * separate tags, and losing them would silently untag their videos as well.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tagId = Number(id);
  const tag = db
    .prepare("SELECT parent_id FROM tags WHERE id = ?")
    .get(tagId) as { parent_id: number | null } | undefined;
  if (!tag) return NextResponse.json({ ok: true });

  const tx = db.transaction(() => {
    db.prepare("UPDATE tags SET parent_id = ? WHERE parent_id = ?").run(
      tag.parent_id,
      tagId,
    );
    // video_tags and tag_aliases are removed by their foreign keys.
    db.prepare("DELETE FROM tags WHERE id = ?").run(tagId);
  });
  tx();
  notifyVideosChanged();

  return NextResponse.json({ ok: true });
}
