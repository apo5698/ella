import { NextResponse } from "next/server";
import db from "@/lib/db";
import { clearFinishedTasks, notifyTasksChanged } from "@/lib/tasks";

export const runtime = "nodejs";

/** Removes finished tasks. Queued and running ones are left alone. */
export async function POST() {
  const removed = clearFinishedTasks(db);
  notifyTasksChanged();
  return NextResponse.json({ ok: true, removed });
}
