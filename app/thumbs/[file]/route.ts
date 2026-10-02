import { readFile } from "node:fs/promises";
import path from "node:path";
import { THUMB_DIR } from "@/lib/config";

export const runtime = "nodejs";

/** Thumbnails are written as `<video id>.jpg`, and nothing else is served. */
const THUMBNAIL_NAME = /^\d+\.jpg$/;

/**
 * Thumbnails written after the server started. A production server serves
 * only the files `public/` held when it started, so a cover made for a new
 * download or picked in the editor would answer 404 until a restart. Files
 * that were already there are still served from `public/` before this runs.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!THUMBNAIL_NAME.test(file)) return new Response(null, { status: 404 });
  try {
    const image = await readFile(path.join(THUMB_DIR, file));
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        // Matches what `public/` sends: a replaced cover keeps its name.
        "Cache-Control": "public, max-age=0",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
