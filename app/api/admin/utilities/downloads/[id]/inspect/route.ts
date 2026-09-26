import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getJob } from "@/lib/jobs";
import type {
  DownloadInspection,
  DownloadJobFailure,
} from "@/lib/utilities/downloadTypes";

export const runtime = "nodejs";

/** What a failed download kept, as a tree of files and opened archives. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  const retained =
    job?.kind === "VIDEO_DOWNLOAD" && job.status === "failed"
      ? (job.outcome as DownloadJobFailure | null)?.retained
      : undefined;
  if (!retained) {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  return NextResponse.json({
    tree: retained.tree,
    truncated: retained.truncated,
  } satisfies DownloadInspection);
}
