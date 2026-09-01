import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getTask, notifyTasksChanged, retryTask } from "@/lib/tasks";
import { kickTaskRunner } from "@/lib/taskRunner";

export const runtime = "nodejs";

/** Queues the same work again. The original row stays as history. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = getTask(db, Number(id));
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  if (task.status === "queued" || task.status === "running") {
    return NextResponse.json({ error: "任务尚未结束" }, { status: 409 });
  }

  const created = retryTask(db, task.id);
  notifyTasksChanged();
  kickTaskRunner();
  return NextResponse.json({ ok: true, id: created });
}
