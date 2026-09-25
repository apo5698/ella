import path from "node:path";
import { AppError } from "@/lib/appError";
import {
  extractArchiveSafely,
  listRegularFiles,
} from "@/lib/utilities/safeArchive";

/**
 * SYKB's layout: an outer ZIP or 7z holding exactly one inner ZIP or 7z,
 * which holds exactly one MP4. Directory wrappers are allowed at each level.
 */
export async function extractSykbVideo(
  archive: string,
  workspace: string,
  onProgress: (layer: 1 | 2, percent: number | null) => void,
  signal?: AbortSignal,
) {
  const outer = path.join(workspace, "outer");
  const inner = path.join(workspace, "inner");
  onProgress(1, null);
  await extractArchiveSafely(archive, outer, {
    onPercent: (percent) => onProgress(1, percent),
    signal,
  });
  const nested = await listRegularFiles(outer);
  if (nested.length !== 1 || !/\.(7z|zip)$/i.test(nested[0]))
    throw new AppError("sykbArchiveStructure");
  onProgress(2, null);
  await extractArchiveSafely(nested[0], inner, {
    onPercent: (percent) => onProgress(2, percent),
    signal,
  });
  const videos = await listRegularFiles(inner);
  if (videos.length !== 1 || !/\.mp4$/i.test(videos[0]))
    throw new AppError("sykbArchiveStructure");
  return videos[0];
}
