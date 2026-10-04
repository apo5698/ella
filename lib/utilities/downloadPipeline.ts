import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "@/lib/appError";
import { downloadBaiduShare } from "@/lib/utilities/baiduShare";
import {
  findDownloadConflict,
  importDownloadedVideo,
} from "@/lib/utilities/downloadImport";
import {
  inspectDownload,
  RetainedDownloadError,
} from "@/lib/utilities/downloadInspect";
import {
  createDownloadInputSchema,
  type DownloadInput,
  type DownloadSource,
} from "@/lib/utilities/downloadSources";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";
import {
  createWorkspace,
  discardWorkspace,
} from "@/lib/utilities/downloadWorkspace";
import {
  detectArchiveType,
  extractArchiveSafely,
  listRegularFiles,
} from "@/lib/utilities/safeArchive";
import { detectVideoExtension } from "@/lib/utilities/videoSniff";

/** Refusals about what arrived, rather than about the transfer. */
const LAYOUT_ERRORS = new Set([
  "downloadLayoutUnexpected",
  "archiveUnsupported",
  "archiveVideoCount",
]);

// A fast download would otherwise emit an event per chunk, which says nothing
// the previous one did not.
const PROGRESS_INTERVAL_MS = 100;

async function fetchHttp(
  url: string,
  workspace: string,
  onProgress: DownloadProgressReporter,
  signal?: AbortSignal,
) {
  const response = await fetch(url, { redirect: "follow", signal });
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

  // Named by nothing the server said: the type is read from the content.
  const file = path.join(workspace, "download");
  onProgress({ phase: "downloading", received: 0, total });
  await pipeline(
    Readable.fromWeb(response.body as never),
    counter,
    createWriteStream(file),
    { signal },
  );
  onProgress({ phase: "downloading", received, total });
  return [file];
}

function fetchFiles(
  source: DownloadSource,
  input: DownloadInput,
  workspace: string,
  onProgress: DownloadProgressReporter,
  signal?: AbortSignal,
): Promise<string[]> {
  switch (source.transport) {
    case "http":
      return fetchHttp(input.url, workspace, onProgress, signal);
    case "baidu-share":
      onProgress({ phase: "downloading", received: 0, total: null });
      return downloadBaiduShare(
        { url: input.url, code: input.code ?? "" },
        workspace,
        {
          onTransfer: (transfer) =>
            onProgress({ phase: "downloading", ...transfer }),
          signal,
        },
      );
  }
}

/**
 * Opens `layers` archives, one inside the next, and finds the video in the
 * last. Archives and videos are recognised by content, since shares often
 * carry files with no usable name.
 */
export async function unpackVideo(
  files: string[],
  {
    layers,
    workspace,
    password,
    onProgress = () => {},
    signal,
  }: {
    layers: number;
    workspace: string;
    password?: string;
    onProgress?: DownloadProgressReporter;
    signal?: AbortSignal;
  },
) {
  let current = files;
  for (let layer = 1; layer <= layers; layer++) {
    if (current.length !== 1 || !(await detectArchiveType(current[0])))
      throw new AppError("downloadLayoutUnexpected");
    const report = (percent: number | null) =>
      onProgress({
        phase: "extracting",
        percent,
        ...(layers > 1 ? { layer, layers } : {}),
      });
    report(null);
    const destination = path.join(workspace, `layer-${layer}`);
    await extractArchiveSafely(current[0], destination, {
      onPercent: report,
      signal,
      password,
    });
    current = await listRegularFiles(destination);
  }

  const videos: { file: string; extension: string }[] = [];
  for (const file of current) {
    const extension = await detectVideoExtension(file).catch(() => null);
    if (extension) videos.push({ file, extension });
  }
  if (videos.length === 1) return videos[0];
  throw layers === 0
    ? new AppError("downloadLayoutUnexpected")
    : new AppError("archiveVideoCount", { count: videos.length });
}

/** Downloads one video as `source` describes and adds it to the library. */
export async function runDownload(
  source: DownloadSource,
  rawInput: unknown,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const input = createDownloadInputSchema(source).parse(
    rawInput,
  ) as DownloadInput;
  // Asked again here rather than trusted from the request: the name is
  // otherwise tested only once the video is unpacked, by which point the
  // transfer has already been paid for.
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;

  const workspace = await createWorkspace("download");
  let retained = false;
  try {
    const files = await fetchFiles(
      source,
      input,
      workspace,
      onProgress,
      signal,
    );
    let video: { file: string; extension: string };
    try {
      video = await unpackVideo(files, {
        layers: source.layers,
        workspace,
        password: input.password,
        onProgress,
        signal,
      });
    } catch (error) {
      // The transfer is paid for. Keep what arrived and describe it, so the
      // user can choose the video instead of downloading it again.
      if (
        source.onUnexpectedLayout !== "retain" ||
        !(error instanceof AppError) ||
        !LAYOUT_ERRORS.has(error.code)
      )
        throw error;
      onProgress({ phase: "extracting", percent: null });
      const inspection = await inspectDownload(
        workspace,
        files,
        signal,
        input.password,
      );
      retained = true;
      throw new RetainedDownloadError(error, { workspace, ...inspection });
    }
    return await importDownloadedVideo(
      video.file,
      input.name,
      () => onProgress({ phase: "importing" }),
      video.extension,
    );
  } finally {
    if (!retained) await discardWorkspace(workspace);
  }
}
