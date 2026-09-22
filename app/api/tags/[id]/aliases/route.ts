import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("Api");
  const { id } = await params;
  const tagId = Number(id);
  const tag = db.prepare("SELECT name FROM tags WHERE id = ?").get(tagId) as
    { name: string } | undefined;
  if (!tag)
    return NextResponse.json({ error: t("tagMissing") }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const alias = normalizeTagName(String(body.alias ?? ""));
  if (!alias)
    return NextResponse.json({ error: t("aliasRequired") }, { status: 400 });
  if (alias === tag.name) {
    return NextResponse.json({ error: t("aliasSameName") }, { status: 400 });
  }

  const clash = resolveTagName(db, alias);
  if (clash.id !== null) {
    return NextResponse.json(
      {
        error: clash.alias
          ? t("aliasExists", { alias, name: clash.name })
          : t("aliasIsTag", { alias }),
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
  const t = await getTranslations("Api");
  const { id } = await params;
  const alias = normalizeTagName(
    new URL(req.url).searchParams.get("alias") ?? "",
  );
  if (!alias)
    return NextResponse.json({ error: t("aliasRequired") }, { status: 400 });
  db.prepare("DELETE FROM tag_aliases WHERE alias = ? AND tag_id = ?").run(
    alias,
    Number(id),
  );
  return NextResponse.json({ ok: true });
}
