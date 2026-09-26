import { AppError } from "@/lib/appError";
import { downloadBaiduShare } from "@/lib/utilities/baiduShare";
import { extractShareVideo } from "@/lib/utilities/shareArchive";
import {
  findDownloadConflict,
  importDownloadedVideo,
} from "@/lib/utilities/downloadImport";
import {
  inspectDownload,
  RetainedDownloadError,
} from "@/lib/utilities/downloadInspect";
import {
  createWorkspace,
  discardWorkspace,
} from "@/lib/utilities/downloadWorkspace";
import {
  shareDownloadSchema,
  type ShareDownloadInput,
} from "@/lib/utilities/shareSchema";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";

/** Refusals about what the share contains, rather than about the transfer. */
const LAYOUT_ERRORS = new Set(["shareArchiveStructure", "archiveUnsupported"]);

export async function downloadShare(
  rawInput: ShareDownloadInput,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const input = shareDownloadSchema.parse(rawInput);
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;
  const workspace = await createWorkspace("share");
  let retained = false;
  try {
    onProgress({ phase: "downloading", received: 0, total: null });
    const files = await downloadBaiduShare(input, workspace, {
      onTransfer: (transfer) =>
        onProgress({ phase: "downloading", ...transfer }),
      signal,
    });
    let video: { file: string; extension: string };
    try {
      if (files.length !== 1) throw new AppError("shareArchiveStructure");
      video = await extractShareVideo(
        files[0],
        workspace,
        (layer, percent) =>
          onProgress({ phase: "extracting", percent, layer, layers: 2 }),
        signal,
      );
    } catch (error) {
      // The transfer is paid for. Keep what arrived and describe it, so the
      // user can choose the video instead of downloading it again.
      if (!(error instanceof AppError) || !LAYOUT_ERRORS.has(error.code))
        throw error;
      onProgress({ phase: "extracting", percent: null });
      const inspection = await inspectDownload(workspace, files, signal);
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
