import db from "@/lib/db";
import { notifyVideoMetrics } from "@/lib/videoEvents";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId)) return new Response(null, { status: 404 });

  const row = db
    .prepare(
      "UPDATE videos SET clicks = clicks + 1 WHERE id = ? RETURNING clicks",
    )
    .get(videoId) as { clicks: number } | undefined;
  if (!row) return new Response(null, { status: 404 });

  notifyVideoMetrics({ videoId, clicks: row.clicks });
  return new Response(null, { status: 204 });
}
