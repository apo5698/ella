import { getTranslations } from "next-intl/server";
import fs from "node:fs";
import db from "@/lib/db";
import { fileResponse } from "@/lib/fileResponse";

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
  const t = await getTranslations("Api");
  const { id } = await params;
  const row = db
    .prepare("SELECT path, ext FROM videos WHERE id = ?")
    .get(id) as { path: string; ext: string } | undefined;
  if (!row) return new Response(t("videoMissing"), { status: 404 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(row.path);
  } catch {
    return new Response(t("videoFileMissing"), { status: 404 });
  }

  const mime = MIME_MAP[row.ext.toLowerCase()] ?? "application/octet-stream";
  return fileResponse(req, row.path, stat.size, mime);
}
