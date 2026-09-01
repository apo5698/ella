import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import db from "@/lib/db";
import {
  FFMPEG_PATH,
  FFPROBE_PATH,
  THUMB_DIR,
  VIDEO_EXTENSIONS,
} from "@/lib/config";

type VideoMetadata = {
  duration: number | null;
  width: number | null;
  height: number | null;
};

export type CatalogResult = {
  id: number;
  status: "added" | "updated" | "skipped";
};

export function listVideoFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listVideoFiles(fullPath));
    else if (
      entry.isFile() &&
      VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

export function probeVideo(file: string): VideoMetadata {
  const result = spawnSync(
    FFPROBE_PATH,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "format=duration:stream=width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0 || !result.stdout) {
    return { duration: null, width: null, height: null };
  }
  try {
    const data = JSON.parse(result.stdout);
    const duration = Number.parseFloat(data.format?.duration);
    return {
      duration: Number.isFinite(duration) ? duration : null,
      width: data.streams?.[0]?.width ?? null,
      height: data.streams?.[0]?.height ?? null,
    };
  } catch {
    return { duration: null, width: null, height: null };
  }
}

function createThumbnail(file: string, id: number, duration: number | null) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const output = path.join(THUMB_DIR, `${id}.jpg`);
  const seek = duration ? Math.min(Math.max(duration * 0.15, 1), 60) : 3;
  const result = spawnSync(
    FFMPEG_PATH,
    [
      "-y",
      "-ss",
      seek.toFixed(2),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=400:-2",
      "-strict",
      "unofficial",
      "-loglevel",
      "error",
      output,
    ],
    { encoding: "utf8" },
  );
  return result.status === 0 && fs.existsSync(output)
    ? `/thumbs/${id}.jpg`
    : null;
}

export function recordVideo(
  file: string,
  options: { title?: string } = {},
): CatalogResult {
  const stat = fs.statSync(file);
  const mtime = Math.floor(stat.mtimeMs);
  const existing = db
    .prepare("SELECT id, size_bytes, mtime, title FROM videos WHERE path = ?")
    .get(file) as
    | { id: number; size_bytes: number; mtime: number; title: string }
    | undefined;
  const ext = path.extname(file).toLowerCase();
  const filename = path.basename(file);
  const title =
    options.title?.trim() || existing?.title || path.basename(file, ext);

  if (
    existing &&
    existing.size_bytes === stat.size &&
    existing.mtime === mtime
  ) {
    if (existing.title !== title)
      db.prepare("UPDATE videos SET title = ? WHERE id = ?").run(
        title,
        existing.id,
      );
    return {
      id: existing.id,
      status: existing.title === title ? "skipped" : "updated",
    };
  }

  const metadata = probeVideo(file);
  if (existing) {
    const thumbnail = fs.existsSync(path.join(THUMB_DIR, `${existing.id}.jpg`))
      ? null
      : createThumbnail(file, existing.id, metadata.duration);
    db.prepare(
      `
      UPDATE videos SET filename=@filename, title=@title, ext=@ext, size_bytes=@size,
        duration_sec=@duration, width=@width, height=@height, mtime=@mtime,
        thumbnail=COALESCE(@thumbnail, thumbnail)
      WHERE id=@id
    `,
    ).run({
      id: existing.id,
      filename,
      title,
      ext,
      size: stat.size,
      ...metadata,
      mtime,
      thumbnail,
    });
    return { id: existing.id, status: "updated" };
  }

  const result = db
    .prepare(
      `
    INSERT INTO videos
      (path, filename, title, ext, size_bytes, duration_sec, width, height, mtime, thumbnail, created_at)
    VALUES
      (@path, @filename, @title, @ext, @size, @duration, @width, @height, @mtime, NULL, @createdAt)
  `,
    )
    .run({
      path: file,
      filename,
      title,
      ext,
      size: stat.size,
      ...metadata,
      mtime,
      createdAt: Date.now(),
    });
  const id = Number(result.lastInsertRowid);
  const thumbnail = createThumbnail(file, id, metadata.duration);
  if (thumbnail)
    db.prepare("UPDATE videos SET thumbnail = ? WHERE id = ?").run(
      thumbnail,
      id,
    );
  return { id, status: "added" };
}
