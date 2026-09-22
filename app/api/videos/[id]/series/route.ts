import { getTranslations } from "next-intl/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureSeries, normalizeSeriesName } from "@/lib/series";
import { notifyVideosChanged } from "@/lib/videoEvents";

/**
 * Sets or clears a video's series. Send `{ name: "..." }` to assign (creating
 * the series if new), or `{ name: null }` to clear it. A blank name is treated
 * as "clear" rather than stored as an empty string.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json(
      { ok: false, error: t("invalidVideoId") },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = body.name;
  const name = typeof raw === "string" ? normalizeSeriesName(raw) : "";

  if (!name) {
    db.prepare("UPDATE videos SET series_id = NULL WHERE id = ?").run(videoId);
    notifyVideosChanged([videoId]);
    return NextResponse.json({ ok: true, series: null });
  }

  const result = db.transaction(() => {
    const row = ensureSeries(db, name);
    db.prepare("UPDATE videos SET series_id = ? WHERE id = ?").run(
      row.id,
      videoId,
    );
    return row;
  })();

  notifyVideosChanged([videoId]);

  return NextResponse.json({ ok: true, series: result });
}
