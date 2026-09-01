import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { aliasesOf, mergeTags } from "@/lib/tagHierarchy";

/**
 * Folds several tags into one. Their names survive as aliases of the target,
 * so the spellings stay searchable and stay out of the tag list.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sourceIds = Array.isArray(body.sourceIds)
    ? body.sourceIds.map(Number).filter(Number.isFinite)
    : [];
  const targetId = Number(body.targetId);

  if (!Number.isFinite(targetId)) {
    return NextResponse.json({ error: "请选择目标标签。" }, { status: 400 });
  }
  if (sourceIds.length === 0) {
    return NextResponse.json(
      { error: "请选择要合并的标签。" },
      { status: 400 },
    );
  }

  try {
    const result = mergeTags(db, sourceIds, targetId);
    // `aliases` names what this call folded in. The target may also have
    // inherited the sources' own aliases, so its full list goes back too.
    return NextResponse.json({
      ok: true,
      ...result,
      targetAliases: aliasesOf(db, targetId),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
