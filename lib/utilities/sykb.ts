import { AppError } from "@/lib/appError";
import { downloadBaiduShare } from "@/lib/utilities/baiduShare";
import { extractSykbVideo } from "@/lib/utilities/sykbArchive";
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
  sykbDownloadSchema,
  type SykbDownloadInput,
} from "@/lib/utilities/sykbSchema";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";

/** Refusals about what the share contains, rather than about the transfer. */
const LAYOUT_ERRORS = new Set(["sykbArchiveStructure", "archiveUnsupported"]);

export async function downloadSykb(
  rawInput: SykbDownloadInput,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const input = sykbDownloadSchema.parse(rawInput);
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;
  const workspace = await createWorkspace("sykb");
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
      if (files.length !== 1) throw new AppError("sykbArchiveStructure");
      video = await extractSykbVideo(
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
