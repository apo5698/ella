import db from "@/lib/db";
import { enqueueCatalogScan } from "@/lib/taskRunner";

export const runtime = "nodejs";

export async function POST() {
  const taskId = enqueueCatalogScan(db);
  if (taskId === null) {
    return Response.json({ error: "视频目录扫描已在队列中" }, { status: 409 });
  }

  return Response.json({ taskId }, { status: 202 });
}
