import { AppError } from "@/lib/appError";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  findDownloadConflict,
  importDownloadedVideo,
} from "@/lib/utilities/downloadImport";
export {
  buildSafeVideoName,
  findDownloadConflict,
  DuplicateContentError,
} from "@/lib/utilities/downloadImport";
import type { QinglanhuaDownloadInput } from "@/lib/utilities/qinglanhuaSchema";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";
import { run7za } from "@/lib/utilities/sevenZip";
import { listVideoFiles } from "@/lib/videoCatalog";

// A fast download would otherwise emit an event per chunk, which says nothing
// the previous one did not.
const PROGRESS_INTERVAL_MS = 100;

async function downloadArchive(
  source: URL,
  archive: string,
  onProgress: DownloadProgressReporter,
  signal?: AbortSignal,
) {
  const response = await fetch(source, { redirect: "follow", signal });
  if (!response.ok || !response.body)
    throw new AppError("downloadHttpFailed", { status: response.status });

  const declared = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  let received = 0;
  let reportedAt = 0;

  // Counting sits between the response and the file so the figure reported is
  // bytes actually written rather than bytes merely requested.
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      const now = Date.now();
      if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
        reportedAt = now;
        onProgress({ phase: "downloading", received, total });
      }
      callback(null, chunk);
    },
  });

  onProgress({ phase: "downloading", received: 0, total });
  await pipeline(
    Readable.fromWeb(response.body as never),
    counter,
    createWriteStream(archive),
    { signal },
  );
  onProgress({ phase: "downloading", received, total });
}

async function extractArchive(
  archive: string,
  destination: string,
  password: string,
  onProgress: DownloadProgressReporter,
  signal?: AbortSignal,
) {
  onProgress({ phase: "extracting", percent: null });
  try {
    await run7za(["x", "-y", `-p${password}`, `-o${destination}`, archive], {
      onPercent: (percent) => onProgress({ phase: "extracting", percent }),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new AppError("archiveFailed", {}, { cause });
  }
}

async function assertHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("downloadUrlInvalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("downloadProtocol");
  }
  return url;
}

export async function downloadQinglanhua(
  input: QinglanhuaDownloadInput,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const sourceUrl = await assertHttpUrl(input.url);

  // Asked again here rather than trusted from the caller: the name is
  // otherwise tested only once the archive is open, by which point the
  // transfer has already been paid for.
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;

  const workspace = await mkdtemp(path.join(tmpdir(), "ella-qinglanhua-"));
  const archive = path.join(workspace, "download");
  const extracted = path.join(workspace, "extracted");

  try {
    await downloadArchive(sourceUrl, archive, onProgress, signal);
    await mkdir(extracted);
    await extractArchive(
      archive,
      extracted,
      input.password,
      onProgress,
      signal,
    );

    const videos = listVideoFiles(extracted);
    if (videos.length !== 1)
      throw new AppError("archiveVideoCount", { count: videos.length });

    return await importDownloadedVideo(videos[0], input.name, onProgress);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
