import fs from "node:fs";
import { Readable } from "node:stream";
import db from "@/lib/db";

export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".ts": "video/mp2t",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db
    .prepare("SELECT path, ext FROM videos WHERE id = ?")
    .get(id) as { path: string; ext: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(row.path);
  } catch {
    return new Response("File missing on disk", { status: 404 });
  }

  const mime = MIME_MAP[row.ext.toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(
      fs.createReadStream(row.path),
    ) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0;
  let end = stat.size - 1;
  if (match) {
    if (match[1]) start = parseInt(match[1], 10);
    if (match[2]) end = parseInt(match[2], 10);
  }
  end = Math.min(end, stat.size - 1);
  if (start > end || start >= stat.size) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(
    fs.createReadStream(row.path, { start, end }),
  ) as ReadableStream;

  return new Response(stream, {
    status: 206,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
