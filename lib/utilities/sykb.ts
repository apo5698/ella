import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError } from "@/lib/appError";
import { downloadBaiduShare } from "@/lib/utilities/baiduShare";
import { extractSykbVideo } from "@/lib/utilities/sykbArchive";
import {
  findDownloadConflict,
  importDownloadedVideo,
} from "@/lib/utilities/downloadImport";
import {
  sykbDownloadSchema,
  type SykbDownloadInput,
} from "@/lib/utilities/sykbSchema";
import type { DownloadProgressReporter } from "@/lib/utilities/downloadTypes";

export async function downloadSykb(
  rawInput: SykbDownloadInput,
  onProgress: DownloadProgressReporter = () => {},
  signal?: AbortSignal,
) {
  const input = sykbDownloadSchema.parse(rawInput);
  const conflict = findDownloadConflict(input);
  if (conflict) throw conflict.error;
  const workspace = await mkdtemp(path.join(tmpdir(), "ella-sykb-"));
  try {
    onProgress({ phase: "downloading", received: 0, total: null });
    const files = await downloadBaiduShare(input, workspace, {
      onTransfer: (transfer) =>
        onProgress({ phase: "downloading", ...transfer }),
      signal,
    });
    if (files.length !== 1 || !/\.(7z|zip)$/i.test(files[0]))
      throw new AppError("sykbArchiveStructure");
    const archive = files[0];
    const video = await extractSykbVideo(
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
