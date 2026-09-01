import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").run(id);
  const row = db.prepare("SELECT views FROM videos WHERE id = ?").get(id) as
    { views: number } | undefined;
  return NextResponse.json({ views: row?.views ?? 0 });
}
