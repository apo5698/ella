import { AppError } from "@/lib/appError";
import { constants } from "node:fs";
import { access, copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { VIDEO_EXTENSIONS, VIDEO_ROOT } from "@/lib/config";
import { suggestAutoTagsForVideo } from "@/lib/autoTagging";
import db from "@/lib/db";
import {
  fileBaseExists,
  findContentDuplicates,
  findDuplicateName,
  findNameConflict,
  findSimilarNames,
  type VideoRef,
} from "@/lib/duplicates";
import { probeVideo, recordVideo } from "@/lib/videoCatalog";
const MAX_FILENAME_BYTES = 255;

function truncateUtf8(value: string, maxBytes: number) {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const nextBytes = Buffer.byteLength(character);
    if (bytes + nextBytes > maxBytes) break;
    result += character;
    bytes += nextBytes;
  }
  return result;
}

export function buildSafeVideoName(
  requestedName: string,
  videoExtension: string,
) {
  const input = requestedName.trim();
  if (!input) throw new AppError("downloadNameRequired");
  const inputExtension = path.extname(input).toLowerCase();
  const base = VIDEO_EXTENSIONS.has(inputExtension)
    ? input.slice(0, -inputExtension.length)
    : input;
  const safeBase =
    base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "") ||
    "video";
  const maxBaseBytes = MAX_FILENAME_BYTES - Buffer.byteLength(videoExtension);
  const truncatedBase =
    truncateUtf8(safeBase, maxBaseBytes).replace(/[. ]+$/g, "") || "video";
  return {
    filename: `${truncatedBase}${videoExtension}`,
    title: base,
    truncated: truncatedBase !== safeBase,
  };
}

async function exists(file: string) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type DownloadConflict = {
  reason: "name" | "file" | "similar";
  error: AppError;
  /** The video to link to, where the conflict is with a record. */
  video: (VideoRef & { score?: number }) | null;
};

/**
 * Everything that can be known before a byte is fetched. Separate from the
 * download so the request can be refused with a status instead of opening a
 * stream that carries nothing but its own failure.
 */
export function findDownloadConflict(input: {
  name: string;
}): DownloadConflict | null {
  // The extension arrives with the archive, so the name is held against the
  // base that 7za will land on.
  const base = buildSafeVideoName(input.name, "").filename;
  const taken = findNameConflict(db, base);
  if (taken) {
    // The title is not repeated here: it can be long, and the video it names
    // is one link away.
    return {
      reason: "name",
      error: new AppError("downloadNameExists"),
      video: taken,
    };
  }
  // A file put there by hand is on disk before any scan records it.
  if (fileBaseExists(base)) {
    return {
      reason: "file",
      error: new AppError("downloadFileExists", { name: base }),
      video: null,
    };
  }
  // A name one edit away from an existing one is the same video asked for
  // again. Refused rather than reported, since reporting it costs the whole
  // transfer to say so.
  const duplicate = findDuplicateName(db, input.name);
  if (duplicate) {
    return {
      reason: "similar",
      error: new AppError("downloadSimilarExists"),
      video: duplicate,
    };
  }
  return null;
}

/** Carries the video a refusal points at, which an Error cannot. */
export class DuplicateContentError extends AppError {
  readonly video: VideoRef;

  constructor(video: VideoRef) {
    super("downloadDuplicate");
    this.name = "DuplicateContentError";
    this.video = video;
  }
}

export async function importDownloadedVideo(
  video: string,
  requestedName: string,
  onProgress: (progress: { phase: "importing" }) => void,
  /** For a file whose name carries no extension, or the wrong one. */
  extension = path.extname(video).toLowerCase(),
) {
  onProgress({ phase: "importing" });
  // The only look the content itself gets, and the one that catches a video
  // already held under another name.
  const { size } = await stat(video);
  const matches = findContentDuplicates(db, size, probeVideo(video).duration);
  // Refused here rather than after the copy: the file is still in the
  // workspace, so nothing has to be undone.
  const identical = matches.find((match) => match.reason === "identical");
  if (identical) throw new DuplicateContentError(identical);
  const duplicates = matches;
  const similar = findSimilarNames(db, requestedName);

  const safeName = buildSafeVideoName(requestedName, extension);
  await mkdir(VIDEO_ROOT, { recursive: true });
  const target = path.join(VIDEO_ROOT, safeName.filename);
  if (await exists(target))
    throw new AppError("downloadFileExists", { name: safeName.filename });
  await copyFile(video, target, constants.COPYFILE_EXCL);

  try {
    const result = recordVideo(target, { title: safeName.title });
    const autoTagSuggestions = suggestAutoTagsForVideo(db, result.id);
    return {
      videoId: result.id,
      ...safeName,
      duplicates,
      similar,
      autoTagSuggestions,
    };
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
