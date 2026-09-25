import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError } from "@/lib/appError";
import { downloadBaiduShare } from "@/lib/utilities/baiduShare";
import { extractShareVideo } from "@/lib/utilities/shareArchive";
import {
  findDownloadConflict,
  importDownloadedVideo,
} from "@/lib/utilities/downloadImport";
import {
  shareDownloadSchema,
  type ShareDownloadInput,
} from "@/lib/utilities/shareSchema";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";

export async function downloadShare(
  rawInput: ShareDownloadInput,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const input = shareDownloadSchema.parse(rawInput);
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;
  const workspace = await mkdtemp(path.join(tmpdir(), "ella-share-"));
  try {
    onProgress({ phase: "downloading", received: 0, total: null });
    const files = await downloadBaiduShare(input, workspace, {
      onTransfer: (transfer) =>
        onProgress({ phase: "downloading", ...transfer }),
      signal,
    });
    if (files.length !== 1 || !/\.(7z|zip)$/i.test(files[0]))
      throw new AppError("shareArchiveStructure");
    const archive = files[0];
    const video = await extractShareVideo(
      archive,
      workspace,
      (layer, percent) =>
        onProgress({ phase: "extracting", percent, layer, layers: 2 }),
      signal,
    );
    return await importDownloadedVideo(video, input.name, () =>
      onProgress({ phase: "importing" }),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
