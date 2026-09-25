// The download history, pushed again whenever a task changes. Filtered on
// the server so a search reaches the whole history, not only what is loaded.
import db from "@/lib/db";
import { eventStreamResponse } from "@/lib/eventStream";
import { subscribeJobs } from "@/lib/jobs";
import { listDownloads } from "@/lib/utilities/downloadJobs";
import "@/lib/taskRunner";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  return eventStreamResponse(req, {
    subscribe: [subscribeJobs],
    snapshot: () => listDownloads(db, query),
  });
}
