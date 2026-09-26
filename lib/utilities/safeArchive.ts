import { execFile } from "node:child_process";
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AppError } from "@/lib/appError";
import { ensure7za, run7za } from "@/lib/utilities/sevenZip";

/**
 * Extraction for archives that come from outside: shares, downloads, anything
 * whose contents are not trusted. Each source decides what layout it expects;
 * this only guarantees that what lands on disk stays inside the destination.
 */

const exec = promisify(execFile);

/** Every file under a directory. A link or device file means a hostile archive. */
export async function listRegularFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await listRegularFiles(file)));
    else if (entry.isFile()) result.push(file);
    else throw new AppError("archiveUnsafe");
  }
  return result;
}

export type ArchiveType = "zip" | "7z" | "gzip" | "tar";

/**
 * A tar header carries the sum of its own bytes, counting the checksum field
 * as spaces. Old V7 archives have no `ustar` magic, so the sum is what
 * identifies every variant.
 */
function isTarHeader(header: Buffer) {
  if (header.length < 512 || header[0] === 0) return false;
  const field = header.subarray(148, 156).toString("latin1");
  const stored = parseInt(field.replace(/[\0 ]+$/, "").trim(), 8);
  if (!Number.isFinite(stored)) return false;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  return sum === stored;
}

/** Read from the file itself, since the name it arrived with proves nothing. */
export async function detectArchiveType(
  file: string,
): Promise<ArchiveType | null> {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(512);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
      return "zip";
    if (
      bytes
        .subarray(0, 6)
        .equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))
    )
      return "7z";
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return "gzip";
    if (isTarHeader(bytes)) return "tar";
    return null;
  } finally {
    await handle.close();
  }
}

type ExtractOptions = {
  onPercent?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * Lists the archive before writing anything, and refuses links and paths that
 * could escape the destination, including Windows paths when running on Linux.
 */
async function assertSafeListing(archive: string, signal?: AbortSignal) {
  const path7za = await ensure7za();
  const listing = exec(path7za, ["l", "-slt", "-ba", "-p", archive], {
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    signal,
  });
  listing.child.stdin?.end();
  const { stdout } = await listing;
  if (/^Encrypted = \+/m.test(stdout)) throw new AppError("archiveDamaged");
  for (const block of stdout.split(/\r?\n\r?\n/)) {
    const name = /^Path = (.*)$/m.exec(block)?.[1];
    if (!name) continue;
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..") ||
      /^(?:Symbolic Link|Hard Link) = .+/m.test(block) ||
      /^Attributes = .*\bl[rwx-]{9}/m.test(block)
    ) {
      throw new AppError("archiveUnsafe");
    }
  }
}

/**
 * ZIP, 7z, tar and gzip, checked by signature. A gzip that holds a tar is
 * unpacked through to the tar's contents, so a `.tar.gz` is one step for the
 * caller.
 */
export async function extractArchiveSafely(
  archive: string,
  destination: string,
  { onPercent, signal }: ExtractOptions = {},
) {
  try {
    const type = await detectArchiveType(archive);
    if (!type) throw new AppError("archiveUnsupported");
    await assertSafeListing(archive, signal);

    if (type !== "gzip") {
      await mkdir(destination);
      await run7za(["x", "-y", "-p", `-o${destination}`, archive], {
        onPercent,
        signal,
        timeout: 60 * 60_000,
      });
      return;
    }

    // gzip holds exactly one stream. Unpacked beside the destination first,
    // so a tar inside can be checked before anything of it is written.
    const staging = `${destination}.gunzip`;
    await mkdir(staging);
    try {
      await run7za(["x", "-y", `-o${staging}`, archive], {
        onPercent,
        signal,
        timeout: 60 * 60_000,
      });
      const [inner, ...rest] = await listRegularFiles(staging);
      if (!inner || rest.length > 0) throw new AppError("archiveDamaged");
      if ((await detectArchiveType(inner)) === "tar") {
        await extractArchiveSafely(inner, destination, { onPercent, signal });
      } else {
        await mkdir(destination);
        await rename(inner, path.join(destination, path.basename(inner)));
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  } catch (error) {
    if (signal?.aborted || error instanceof AppError) throw error;
    throw new AppError("archiveDamaged");
  }
}
