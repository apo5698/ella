import { open } from "node:fs/promises";
import path from "node:path";

/**
 * The extension a video file should be stored under, or null when it is not a
 * video. Read from the file's header, because shares and archives routinely
 * carry videos with no extension or the wrong one.
 */
export async function detectVideoExtension(
  file: string,
): Promise<string | null> {
  const handle = await open(file, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    header = header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const extension = path.extname(file).toLowerCase();

  // ISO base media: MP4, MOV and M4V all start with an `ftyp` box.
  if (header.subarray(4, 8).toString("latin1") === "ftyp")
    return [".mov", ".m4v"].includes(extension) ? extension : ".mp4";
  // EBML: Matroska and WebM.
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return extension === ".webm" ? ".webm" : ".mkv";
  if (
    header.subarray(0, 4).toString("latin1") === "RIFF" &&
    header.subarray(8, 11).toString("latin1") === "AVI"
  )
    return ".avi";
  if (header.subarray(0, 3).toString("latin1") === "FLV") return ".flv";
  // ASF: WMV.
  if (header.subarray(0, 4).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75])))
    return ".wmv";
  // MPEG transport stream has no magic beyond its sync byte, so the name has
  // to agree.
  if (header[0] === 0x47 && extension === ".ts") return ".ts";
  return null;
}
