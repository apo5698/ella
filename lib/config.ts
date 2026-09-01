import path from "node:path";

export const VIDEO_ROOT =
  process.env.VIDEO_ROOT || path.join(process.cwd(), "videos");
export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";
// OpenAI-compatible endpoint of the local vision model server.
// Nothing leaves the machine: frames are posted to this address only.
export const LMSTUDIO_URL =
  process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
export const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "qwen/qwen3-vl-8b";
// Overridable so a check can run against a scratch database instead of the
// library's own.
export const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "data", "catalog.db");
export const THUMB_DIR =
  process.env.THUMB_DIR || path.join(process.cwd(), "public", "thumbs");
export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".ts",
]);
