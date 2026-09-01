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
  const videoId = parseId((await params).id);
  if (videoId === null) {
    return NextResponse.json(
      { ok: false, error: "视频 ID 无效" },
      { status: 400 },
    );
  }
  try {
    const taskId = enqueueVideoRetag(db, videoId);
    return NextResponse.json(
      { ok: true, taskId, queued: taskId !== null },
      { status: 202 },
    );
  } catch (cause) {
    return NextResponse.json(
      { ok: false, error: (cause as Error).message },
      { status: 404 },
    );
  }
}
