// Server-sent events carrying the task queue. The dock holds this open on
// every page, so nothing is sent while nothing changes: a write to the table
// is what pushes the next list.
import db from "@/lib/db";
import { eventStreamResponse } from "@/lib/eventStream";
import { listJobs, subscribeJobs } from "@/lib/jobs";
import {
  listNotifications,
  notificationCount,
  subscribeNotifications,
  unreadNotificationCount,
} from "@/lib/notifications";
import "@/lib/taskRunner";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return eventStreamResponse(req, {
    subscribe: [subscribeNotifications, subscribeJobs],
    snapshot: () => {
      const jobs = listJobs(db);
      return {
        jobs,
        notifications: listNotifications(db),
        total: notificationCount(db),
        activeCount: jobs.filter(
          ({ status }) => status === "queued" || status === "running",
        ).length,
        unreadCount: unreadNotificationCount(db),
      };
    },
  });
}
