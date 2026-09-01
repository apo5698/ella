// Thumbnail decoding and storage, shared by the live preview in the edit
// dialog and the save that commits a chosen frame.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { FFMPEG_PATH, THUMB_DIR } from "./config";

/** The width the scan writes, so a preview shows the eventual result. */
export const THUMB_WIDTH = 400;

const DECODE_TIMEOUT_MS = 15000;

export function grabFrame(
  file: string,
  seconds: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    // Seeking before -i costs one keyframe of accuracy and decodes in
    // milliseconds instead of reading the file up to that point.
    const proc = spawn(FFMPEG_PATH, [
      "-ss",
      String(seconds),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `scale=${THUMB_WIDTH}:-2`,
      "-strict",
      "unofficial",
      "-f",
      "image2",
      "-vcodec",
      "mjpeg",
      "-loglevel",
      "error",
      "-",
    ]);

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Draining stderr keeps a chatty decode from filling the pipe and stalling.
    proc.stderr.on("data", () => {});

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, DECODE_TIMEOUT_MS);

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      resolve(out.length > 0 ? out : null);
    });
  });
}

/**
 * Where the scan takes its frame. An untouched slider sits here, which is the
 * position the existing thumbnail came from.
 */
export function defaultThumbSec(duration: number | null): number {
  return duration ? Math.min(Math.max(duration * 0.15, 1), 60) : 3;
}

/** Keeps a seek inside the file: past the end decodes to nothing at all. */
export function clampThumbSec(
  seconds: number,
  duration: number | null,
): number {
  const limit = duration && duration > 1 ? duration - 1 : 0;
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), limit);
}

export function writeThumbnail(id: number, jpeg: Buffer): string {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  fs.writeFileSync(path.join(THUMB_DIR, `${id}.jpg`), jpeg);
  // The file keeps its name, so the URL carries a version. Without it the
  // browser would go on showing the frame it already cached.
  return `/thumbs/${id}.jpg?v=${Date.now()}`;
}

export function removeThumbnail(id: number) {
  try {
    fs.unlinkSync(path.join(THUMB_DIR, `${id}.jpg`));
  } catch {
    // Never written, or already gone.
  }
}
