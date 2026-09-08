import { NextResponse } from "next/server";
import db from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import {
  listNotifications,
  notificationCount,
  unreadNotificationCount,
} from "@/lib/notifications";
// Imported for its side effect: loading the runner picks up any task left
// behind by a previous server process.
import "@/lib/taskRunner";

export const runtime = "nodejs";

/** Background jobs plus the independent notification feed. */
export async function GET() {
  const jobs = listJobs(db);
  return NextResponse.json({
    jobs,
    notifications: listNotifications(db),
    total: notificationCount(db),
    activeCount: jobs.filter(
      ({ status }) => status === "queued" || status === "running",
    ).length,
    unreadCount: unreadNotificationCount(db),
  });
}
