import { NextResponse } from "next/server";
import db from "@/lib/db";
import { notifyVideoMetrics } from "@/lib/videoEvents";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").run(id);
  const row = db.prepare("SELECT views FROM videos WHERE id = ?").get(id) as
    { views: number } | undefined;
  const videoId = Number(id);
  if (row && Number.isInteger(videoId)) {
    notifyVideoMetrics({ videoId, views: row.views });
  }
  return NextResponse.json({ views: row?.views ?? 0 });
}
