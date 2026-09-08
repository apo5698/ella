import { NextResponse } from "next/server";
import db from "@/lib/db";
import { cancelQueuedJob, getJob, notifyJobsChanged } from "@/lib/jobs";
import { requestTaskCancel } from "@/lib/taskRunner";

export const runtime = "nodejs";

/**
 * Stops a task. A queued one is settled here; a running one is asked to stop
 * and reports itself canceled once its handler reaches the next chunk.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number(id);
  const job = getJob(db, taskId);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  if (job.status === "running") {
    requestTaskCancel(taskId);
    return NextResponse.json({ ok: true, status: "canceling" });
  }
  if (!cancelQueuedJob(db, taskId)) {
    return NextResponse.json({ error: "任务已结束" }, { status: 409 });
  }
  notifyJobsChanged();
  return NextResponse.json({ ok: true, status: "canceled" });
}
