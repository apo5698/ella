import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getJob, notifyJobsChanged, retryJob } from "@/lib/jobs";
import { kickTaskRunner } from "@/lib/taskRunner";

export const runtime = "nodejs";

/** Queues the same work again. The original row stays as history. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  if (!job) {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  if (job.status === "queued" || job.status === "running") {
    return NextResponse.json({ error: t("taskActive") }, { status: 409 });
  }

  const created = retryJob(db, job.id);
  notifyJobsChanged();
  kickTaskRunner();
  return NextResponse.json({ ok: true, id: created });
}
