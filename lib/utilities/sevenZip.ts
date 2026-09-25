import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod } from "node:fs/promises";
import { path7za } from "7zip-bin";

/** The bundled binary can lose its executable bit when installed. */
export async function ensure7za() {
  await access(path7za, constants.X_OK).catch(() => chmod(path7za, 0o755));
  return path7za;
}

/**
 * Runs a 7za command that reports progress. `-bsp1` puts the percentage on
 * stdout; without it 7za reports progress only on a terminal.
 *
 * Rejects with the tail of stderr as the message, which callers are expected
 * to wrap: it is diagnostic output, not something to show a user.
 */
export async function run7za(
  args: string[],
  {
    onPercent,
    signal,
    timeout,
  }: {
    onPercent?: (percent: number) => void;
    signal?: AbortSignal;
    timeout?: number;
  } = {},
) {
  const binary = await ensure7za();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["-bsp1", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
      timeout,
      killSignal: "SIGKILL",
    });
    let errorOutput = "";
    let last = -1;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      // Updates arrive as carriage-return redraws such as " 42% 3 - video.mp4",
      // so a chunk can hold several and only the last one is current.
      const percentages = chunk.match(/(\d+)%/g);
      if (!percentages) return;
      const percent = Number(percentages[percentages.length - 1].slice(0, -1));
      if (percent === last) return;
      last = percent;
      onPercent?.(percent);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-4000);
    });
    child.on("error", (error) => {
      reject(signal?.aborted ? signal.reason : error);
    });
    child.on("close", (code) => {
      if (signal?.aborted) reject(signal.reason);
      else if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `7za exited with ${code}`));
    });
  });
}
