import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { loadSeries, normalizeSeriesName } from "@/lib/series";

/** Every series, with the number of videos in each. */
export async function GET() {
  return NextResponse.json({ series: loadSeries(db) });
}

/**
 * Creates an empty series. A series usually starts on a video, but the
 * management page can also introduce one before anything is assigned to it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = normalizeSeriesName(String(body.name ?? ""));
  if (!name) {
    return NextResponse.json({ error: "请输入系列名称。" }, { status: 400 });
  }

  const existing = db.prepare("SELECT id FROM series WHERE name = ?").get(name);
  if (existing) {
    return NextResponse.json(
      { error: `系列"${name}"已存在。` },
      { status: 409 },
    );
  }

  const info = db.prepare("INSERT INTO series (name) VALUES (?)").run(name);
  return NextResponse.json({ id: Number(info.lastInsertRowid), name });
}
