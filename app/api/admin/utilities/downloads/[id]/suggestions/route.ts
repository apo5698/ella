import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { autoTagSuggestionKey } from "@/lib/autoTagging";
import db from "@/lib/db";
import { getJob, notifyJobsChanged, setJobOutcome } from "@/lib/jobs";
import type { ImportedDownloadResult } from "@/lib/utilities/downloadTypes";

export const runtime = "nodejs";

const bodySchema = z.object({ keys: z.array(z.string()).min(1) });

/**
 * Drops reviewed tag suggestions from a finished download, so the list does
 * not offer them again. Accepting them is done by /api/auto-tags/review.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  if (!job || job.kind !== "VIDEO_DOWNLOAD") {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: t("operationFailed") }, { status: 400 });
  }
  const result = job.outcome as ImportedDownloadResult | null;
  if (job.status !== "succeeded" || !result?.autoTagSuggestions) {
    return NextResponse.json({ error: t("taskActive") }, { status: 409 });
  }

  const reviewed = new Set(body.data.keys);
  setJobOutcome(db, job.id, {
    ...result,
    autoTagSuggestions: result.autoTagSuggestions.filter(
      (suggestion) => !reviewed.has(autoTagSuggestionKey(suggestion)),
    ),
  });
  notifyJobsChanged();
  return NextResponse.json({ ok: true });
}
