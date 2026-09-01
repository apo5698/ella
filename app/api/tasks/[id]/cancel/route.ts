import { NextResponse } from "next/server";
import db from "@/lib/db";
import { cancelQueuedTask, getTask, notifyTasksChanged } from "@/lib/tasks";
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
  const task = getTask(db, taskId);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  if (task.status === "running") {
    requestTaskCancel(taskId);
    return NextResponse.json({ ok: true, status: "canceling" });
  }
  if (!cancelQueuedTask(db, taskId)) {
    return NextResponse.json({ error: "任务已结束" }, { status: 409 });
  }
  notifyTasksChanged();
  return NextResponse.json({ ok: true, status: "canceled" });
}
