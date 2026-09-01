import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { normalizeSeriesName } from "@/lib/series";

/** Renames a series. The name it is known by is all a series carries. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const seriesId = Number(id);
  const series = db.prepare("SELECT id FROM series WHERE id = ?").get(seriesId);
  if (!series) {
    return NextResponse.json({ error: "系列不存在。" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = normalizeSeriesName(String(body.name ?? ""));
  if (!name) {
    return NextResponse.json({ error: "请输入系列名称。" }, { status: 400 });
  }

  const clash = db.prepare("SELECT id FROM series WHERE name = ?").get(name) as
    { id: number } | undefined;
  if (clash && clash.id !== seriesId) {
    return NextResponse.json(
      { error: `系列"${name}"已存在。` },
      { status: 409 },
    );
  }

  db.prepare("UPDATE series SET name = ? WHERE id = ?").run(name, seriesId);
  return NextResponse.json({ id: seriesId, name });
}

/**
 * Removes a series. The videos in it stay in the library and lose their
 * series, which videos.series_id does on its own through ON DELETE SET NULL.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const seriesId = Number(id);
  if (!Number.isInteger(seriesId)) {
    return NextResponse.json({ error: "系列不存在。" }, { status: 404 });
  }

  db.prepare("DELETE FROM series WHERE id = ?").run(seriesId);
  return NextResponse.json({ ok: true });
}
