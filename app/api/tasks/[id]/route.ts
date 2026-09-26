import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { deleteFinishedJob, getJob, notifyJobsChanged } from "@/lib/jobs";
import { discardDownloadFiles } from "@/lib/utilities/downloadJobs";

export const runtime = "nodejs";

/** Removes a settled task from the list. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  if (!job) {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  if (!deleteFinishedJob(db, job.id)) {
    return NextResponse.json({ error: t("taskActive") }, { status: 409 });
  }
  notifyJobsChanged();
  if (job.kind === "VIDEO_DOWNLOAD") await discardDownloadFiles(job);
  return NextResponse.json({ ok: true });
}
