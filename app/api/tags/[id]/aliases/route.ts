import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { normalizeTagName, resolveTagName } from "@/lib/tagHierarchy";

/**
 * Adds an alternate spelling to a tag. An alias is not itself a tag: the
 * videos already tagged with the spelling being aliased are not moved by this,
 * because that spelling cannot have been a tag in the first place.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tagId = Number(id);
  const tag = db.prepare("SELECT name FROM tags WHERE id = ?").get(tagId) as
    { name: string } | undefined;
  if (!tag)
    return NextResponse.json({ error: "标签不存在。" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const alias = normalizeTagName(String(body.alias ?? ""));
  if (!alias)
    return NextResponse.json({ error: "请输入别名。" }, { status: 400 });
  if (alias === tag.name) {
    return NextResponse.json(
      { error: "别名不能与标签名称相同。" },
      { status: 400 },
    );
  }

  const clash = resolveTagName(db, alias);
  if (clash.id !== null) {
    return NextResponse.json(
      {
        error: clash.alias
          ? `"${alias}"已是标签"${clash.name}"的别名。`
          : `"${alias}"已是一个标签，请先将其删除或重命名。`,
      },
      { status: 409 },
    );
  }

  db.prepare("INSERT INTO tag_aliases (alias, tag_id) VALUES (?, ?)").run(
    alias,
    tagId,
  );
  return NextResponse.json({ ok: true, alias, name: tag.name });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const alias = normalizeTagName(
    new URL(req.url).searchParams.get("alias") ?? "",
  );
  if (!alias)
    return NextResponse.json({ error: "请输入别名。" }, { status: 400 });
  db.prepare("DELETE FROM tag_aliases WHERE alias = ? AND tag_id = ?").run(
    alias,
    Number(id),
  );
  return NextResponse.json({ ok: true });
}
