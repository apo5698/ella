import fs from "node:fs";
import { fileResponse } from "@/lib/fileResponse";
import { previewClipPath } from "@/lib/previewClips";

export const runtime = "nodejs";

/**
 * A video's preview clip. The card asks for it with `?v=` set to the time it
 * was cut, so a clip cut again arrives under a new URL and this one can be
 * cached for good.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response(null, { status: 404 });
  const file = previewClipPath(Number(id));

  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return new Response(null, { status: 404 });
  }

  return fileResponse(req, file, stat.size, "video/mp4", {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}
