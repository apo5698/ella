import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { path7za } from "7zip-bin";
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
import type { QinglanhuaDownloadInput } from "@/lib/utilities/qinglanhuaSchema";
import { listVideoFiles, probeVideo, recordVideo } from "@/lib/videoCatalog";

const MAX_FILENAME_BYTES = 255;

// A fast download would otherwise emit an event per chunk, which says nothing
// the previous one did not and floods the response stream.
const PROGRESS_INTERVAL_MS = 100;

export type DownloadProgress =
  | { phase: "downloading"; received: number; total: number | null }
  | { phase: "extracting"; percent: number | null }
  | { phase: "importing" };

type ProgressReporter = (progress: DownloadProgress) => void;

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
  if (!input) throw new Error("请输入文件名");
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

async function downloadArchive(
  source: URL,
  archive: string,
  onProgress: ProgressReporter,
) {
  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error(`下载失败 (${response.status})`);

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
  );
  onProgress({ phase: "downloading", received, total });
}

async function extractArchive(
  archive: string,
  destination: string,
  password: string,
  onProgress: ProgressReporter,
) {
  try {
    await access(path7za, constants.X_OK);
  } catch {
    await chmod(path7za, 0o755);
  }
  onProgress({ phase: "extracting", percent: null });
  await new Promise<void>((resolve, reject) => {
    // -bsp1 puts the percentage on stdout; without it 7za reports progress
    // only on a terminal and this stage would have nothing to show.
    const child = spawn(
      path7za,
      ["x", "-y", "-bsp1", `-p${password}`, `-o${destination}`, archive],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let errorOutput = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      // Updates arrive as carriage-return redraws such as " 42% 3 - video.mp4",
      // so a chunk can hold several and only the last one is current.
      const percentages = chunk.match(/(\d+)%/g);
      if (!percentages) return;
      onProgress({
        phase: "extracting",
        percent: Number(percentages[percentages.length - 1].slice(0, -1)),
      });
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            errorOutput.trim() || "压缩包解压失败，请检查下载地址和密码",
          ),
        );
    });
  });
}

async function assertHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("请输入有效的视频 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("视频 URL 必须使用 HTTP 或 HTTPS");
  }
  return url;
}

export type DownloadConflict = {
  reason: "name" | "file" | "similar";
  message: string;
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
    return { reason: "name", message: "媒体库中已有同名视频", video: taken };
  }
  // A file put there by hand is on disk before any scan records it.
  if (fileBaseExists(base)) {
    return {
      reason: "file",
      message: `媒体库目录中已存在同名文件 ${base}`,
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
      message: "媒体库中已有名称几乎相同的视频",
      video: duplicate,
    };
  }
  return null;
}

/** Carries the video a refusal points at, which an Error cannot. */
export class DuplicateContentError extends Error {
  readonly video: VideoRef;

  constructor(video: VideoRef) {
    super("内容与媒体库中的视频完全一致");
    this.name = "DuplicateContentError";
    this.video = video;
  }
}

export async function downloadQinglanhua(
  input: QinglanhuaDownloadInput,
  onProgress: ProgressReporter = () => {},
) {
  const sourceUrl = await assertHttpUrl(input.url);

  // Asked again here rather than trusted from the caller: the name is
  // otherwise tested only once the archive is open, by which point the
  // transfer has already been paid for.
  const conflict = findDownloadConflict(input);
  if (conflict) throw new Error(conflict.message);

  const workspace = await mkdtemp(path.join(tmpdir(), "ella-qinglanhua-"));
  const archive = path.join(workspace, "download");
  const extracted = path.join(workspace, "extracted");
  let target = "";

  try {
    await downloadArchive(sourceUrl, archive, onProgress);
    await mkdir(extracted);
    await extractArchive(archive, extracted, input.password, onProgress);

    const videos = listVideoFiles(extracted);
    if (videos.length !== 1)
      throw new Error(
        `压缩包中应有且仅有一个视频，当前找到 ${videos.length} 个`,
      );

    onProgress({ phase: "importing" });
    // The only look the content itself gets, and the one that catches a video
    // already held under another name.
    const { size } = await stat(videos[0]);
    const matches = findContentDuplicates(
      db,
      size,
      probeVideo(videos[0]).duration,
    );
    // Refused here rather than after the copy: the file is still in the
    // workspace, so nothing has to be undone.
    const identical = matches.find((match) => match.reason === "identical");
    if (identical) throw new DuplicateContentError(identical);
    const duplicates = matches;
    const similar = findSimilarNames(db, input.name);

    const extension = path.extname(videos[0]).toLowerCase();
    const safeName = buildSafeVideoName(input.name, extension);
    await mkdir(VIDEO_ROOT, { recursive: true });
    target = path.join(VIDEO_ROOT, safeName.filename);
    if (await exists(target))
      throw new Error(`视频文件 ${safeName.filename} 已存在`);
    await copyFile(videos[0], target, constants.COPYFILE_EXCL);

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
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
