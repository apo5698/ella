import { NextResponse } from "next/server";
import db from "@/lib/db";
import { activeTaskCount, listTasks, taskCount } from "@/lib/tasks";
// Imported for its side effect: loading the runner picks up any task left
// behind by a previous server process.
import "@/lib/taskRunner";

export const runtime = "nodejs";

/** The queue, running and waiting tasks first, then the most recent history. */
export async function GET() {
  return NextResponse.json({
    tasks: listTasks(db),
    total: taskCount(db),
    activeCount: activeTaskCount(db),
  });
}
