import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getJob, setJobPayload } from "@/lib/jobs";
import { startDownload } from "@/lib/taskRunner";
import { discardDownloadFiles } from "@/lib/utilities/downloadJobs";
import type { DownloadJobPayload } from "@/lib/utilities/downloadTypes";

export const runtime = "nodejs";

/**
 * Starts a pending download, or retries a failed or canceled one in place. A
 * retry downloads again, so files kept from the last attempt go.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  if (!job || job.kind !== "VIDEO_DOWNLOAD") {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  if (job.status === "failed" || job.status === "canceled") {
    const { selection, ...payload } = job.payload as DownloadJobPayload;
    if (selection) setJobPayload(db, job.id, payload);
    await discardDownloadFiles(job);
  }
  if (!startDownload(db, job.id)) {
    return NextResponse.json(
      {
        error: t(job.status === "succeeded" ? "taskFinished" : "taskActive"),
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
