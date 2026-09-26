import path from "node:path";
import { AppError } from "@/lib/appError";
import {
  detectArchiveType,
  extractArchiveSafely,
  listRegularFiles,
} from "@/lib/utilities/safeArchive";
import { detectVideoExtension } from "@/lib/utilities/videoSniff";

/**
 * SYKB's layout: an outer archive holding exactly one inner archive, which
 * holds exactly one video. Either archive may be ZIP, 7z, tar or tar.gz, and
 * directory wrappers are allowed. Both are recognised by content, since the
 * inner files often arrive without a usable name.
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
  if (nested.length !== 1 || !(await detectArchiveType(nested[0])))
    throw new AppError("sykbArchiveStructure");
  onProgress(2, null);
  await extractArchiveSafely(nested[0], inner, {
    onPercent: (percent) => onProgress(2, percent),
    signal,
  });
  const files = await listRegularFiles(inner);
  const extension =
    files.length === 1 && (await detectVideoExtension(files[0]));
  if (!extension) throw new AppError("sykbArchiveStructure");
  return { file: files[0], extension };
}
