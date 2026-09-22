import { errorMessage } from "@/lib/appError";
import { getLocale, getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { enqueueVideoRetag } from "@/lib/taskRunner";

export const runtime = "nodejs";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

/** Adds recognition to the persistent queue and returns immediately. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Api");
  const videoId = parseId((await params).id);
  if (videoId === null) {
    return NextResponse.json(
      { ok: false, error: t("invalidVideoId") },
      { status: 400 },
    );
  }
  try {
    const taskId = enqueueVideoRetag(db, videoId, await getLocale());
    return NextResponse.json(
      { ok: true, taskId, queued: taskId !== null },
      { status: 202 },
    );
  } catch (cause) {
    return NextResponse.json(
      { ok: false, error: errorMessage(cause, t) },
      { status: 404 },
    );
  }
}
