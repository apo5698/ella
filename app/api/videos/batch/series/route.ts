import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureSeries, normalizeSeriesName } from "@/lib/series";

/** Sets or clears the series shared by a selection of videos. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids)
    ? [
        ...new Set<number>(
          body.ids
            .map(Number)
            .filter((id: number) => Number.isInteger(id) && id > 0),
        ),
      ]
    : [];
  const rawName = body.name;

  if (ids.length === 0) {
    return NextResponse.json({ error: "请选择视频。" }, { status: 400 });
  }
  if (rawName !== null && typeof rawName !== "string") {
    return NextResponse.json({ error: "系列名称无效。" }, { status: 400 });
  }

  const name = typeof rawName === "string" ? normalizeSeriesName(rawName) : "";
  const series = db.transaction(() => {
    if (!name) {
      const clear = db.prepare(
        "UPDATE videos SET series_id = NULL WHERE id = ?",
      );
      for (const videoId of ids) clear.run(videoId);
      return null;
    }

    const row = ensureSeries(db, name);

    const update = db.prepare("UPDATE videos SET series_id = ? WHERE id = ?");
    for (const videoId of ids) update.run(row.id, videoId);
    return row;
  })();

  return NextResponse.json({
    ok: true,
    videoCount: ids.length,
    series,
  });
}
