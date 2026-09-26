import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getJob, setJobPayload } from "@/lib/jobs";
import { startDownload } from "@/lib/taskRunner";
import { findNode } from "@/lib/utilities/downloadInspect";
import type {
  DownloadJobFailure,
  DownloadJobPayload,
} from "@/lib/utilities/downloadTypes";

export const runtime = "nodejs";

const bodySchema = z.object({ path: z.string().min(1) });

/**
 * Imports a file the user chose from what a failed download kept. The task
 * runs again under the same entry, from the import step.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const job = getJob(db, Number(id));
  const retained =
    job?.kind === "VIDEO_DOWNLOAD" && job.status === "failed"
      ? (job.outcome as DownloadJobFailure | null)?.retained
      : undefined;
  if (!job || !retained) {
    return NextResponse.json({ error: t("taskMissing") }, { status: 404 });
  }
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  const node = body.success ? findNode(retained.tree, body.data.path) : null;
  if (!body.success || node?.kind !== "file") {
    return NextResponse.json(
      { error: t("downloadSelectionInvalid") },
      { status: 400 },
    );
  }

  // The listing moves from the outcome into the payload, since requeueing
  // clears the outcome and the import step needs it.
  const payload: DownloadJobPayload = {
    ...(job.payload as DownloadJobPayload),
    selection: { ...retained, path: node.path },
  };
  setJobPayload(db, job.id, payload);
  if (!startDownload(db, job.id)) {
    return NextResponse.json({ error: t("taskActive") }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
