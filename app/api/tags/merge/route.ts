import { errorMessage } from "@/lib/appError";
import { getTranslations } from "next-intl/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { aliasesOf, mergeTags } from "@/lib/tagHierarchy";
import { notifyVideosChanged } from "@/lib/videoEvents";

/**
 * Folds several tags into one. Their names survive as aliases of the target,
 * so the spellings stay searchable and stay out of the tag list.
 */
export async function POST(req: NextRequest) {
  const t = await getTranslations("Api");
  const body = await req.json().catch(() => ({}));
  const sourceIds = Array.isArray(body.sourceIds)
    ? body.sourceIds.map(Number).filter(Number.isFinite)
    : [];
  const targetId = Number(body.targetId);

  if (!Number.isFinite(targetId)) {
    return NextResponse.json({ error: t("selectTarget") }, { status: 400 });
  }
  if (sourceIds.length === 0) {
    return NextResponse.json({ error: t("selectMergeTags") }, { status: 400 });
  }

  try {
    const result = mergeTags(db, sourceIds, targetId);
    notifyVideosChanged();
    // `aliases` names what this call folded in. The target may also have
    // inherited the sources' own aliases, so its full list goes back too.
    return NextResponse.json({
      ok: true,
      ...result,
      targetAliases: aliasesOf(db, targetId),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err, t) }, { status: 400 });
  }
}
