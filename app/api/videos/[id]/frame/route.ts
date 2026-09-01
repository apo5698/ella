// A single frame from a video, decoded on demand. Backs the thumbnail
// scrubber: the dialog points an <img> at this while the slider moves, so
// nothing is written to disk until the edit is saved.
import db from "@/lib/db";
import { clampThumbSec, grabFrame } from "@/lib/thumbnail";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db
    .prepare("SELECT path, duration_sec FROM videos WHERE id = ?")
    .get(id) as { path: string; duration_sec: number | null } | undefined;
  if (!row) return new Response("视频记录不存在", { status: 404 });

  const asked = Number(new URL(req.url).searchParams.get("t") ?? "0");
  const jpeg = await grabFrame(
    row.path,
    clampThumbSec(asked, row.duration_sec),
  );
  if (!jpeg) return new Response("无法读取该位置的画面", { status: 422 });

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // The same second of the same file always decodes to the same frame, so
      // dragging back to a position already seen costs nothing.
      "Cache-Control": "private, max-age=600",
    },
  });
}
