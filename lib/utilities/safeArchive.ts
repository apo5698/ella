import { execFile } from "node:child_process";
import { mkdir, open, readdir } from "node:fs/promises";
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

/** ZIP and 7z, checked by signature rather than by the name it arrived with. */
export async function extractArchiveSafely(
  archive: string,
  destination: string,
  {
    onPercent,
    signal,
  }: { onPercent?: (percent: number) => void; signal?: AbortSignal } = {},
) {
  try {
    const file = await open(archive, "r");
    try {
      const signature = Buffer.alloc(6);
      await file.read(signature, 0, 6, 0);
      const is7z = signature.equals(
        Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
      );
      const isZip = signature
        .subarray(0, 4)
        .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      if (!is7z && !isZip) throw new AppError("archiveUnsupported");
    } finally {
      await file.close();
    }
    const path7za = await ensure7za();
    // Inspect before writing anything. Reject links and paths that can escape
    // the task directory, including Windows paths when running on Linux.
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
        /^(?:Symbolic Link|Hard Link) = /m.test(block) ||
        /^Attributes = .*\bl[rwx-]{9}/m.test(block)
      ) {
        throw new AppError("archiveUnsafe");
      }
    }
    await mkdir(destination);
    await run7za(["x", "-y", "-p", `-o${destination}`, archive], {
      onPercent,
      signal,
      timeout: 60 * 60_000,
    });
  } catch (error) {
    if (signal?.aborted || error instanceof AppError) throw error;
    throw new AppError("archiveDamaged");
  }
}
