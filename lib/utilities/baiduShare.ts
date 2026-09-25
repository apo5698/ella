import { baiduBinary, baiduConfigDirectory } from "@/lib/utilities/baiduSetup";
import { spawn } from "node:child_process";
import { copyFile, chmod, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/appError";
import type { BaiduShare } from "@/lib/utilities/baiduShareSchema";
import { listRegularFiles } from "@/lib/utilities/safeArchive";
import {
  parseBaiduTransfer,
  type BaiduTransfer,
} from "@/lib/utilities/baiduProgress";

// BaiduPCS-Go prints some failures but still exits 0. Never expose its raw
// output: it may contain account information, cookies or signed URLs.
async function run(
  args: string[],
  configDirectory: string,
  {
    onTransfer,
    signal,
  }: {
    onTransfer?: (transfer: BaiduTransfer) => void;
    signal?: AbortSignal;
  } = {},
) {
  const binary = await baiduBinary();
  signal?.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, BAIDUPCS_GO_CONFIG_DIR: configDirectory },
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let output = "";
    let failed = false;
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill("SIGKILL");
      },
      6 * 60 * 60_000,
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let reported = -1;
    const capture = (chunk: string) => {
      output = (output + chunk).slice(-64 * 1024);
      if (/失败|错误|未登录|未登陆|以下文件下载失败/.test(output))
        failed = true;
      if (!onTransfer) return;
      // A redraw can be split across chunks, so the tail is read rather than
      // the chunk alone.
      const transfer = parseBaiduTransfer(output.slice(-1024));
      if (transfer && transfer.received !== reported) {
        reported = transfer.received;
        onTransfer(transfer);
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        signal?.aborted ? signal.reason : new AppError("baiduUnavailable"),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (signal?.aborted) reject(signal.reason);
      else if (code !== 0 || failed || timedOut)
        reject(new AppError("baiduDownloadFailed"));
      else resolve(output);
    });
  });
}

/**
 * Saves a Baidu Netdisk share into the account, downloads it into
 * `workspace`, and returns every file it contained. Shared by all sources
 * hosted on Baidu Netdisk: what the files must look like is up to the source.
 */
export async function downloadBaiduShare(
  share: BaiduShare,
  workspace: string,
  {
    onTransfer,
    signal,
  }: {
    onTransfer?: (transfer: BaiduTransfer) => void;
    signal?: AbortSignal;
  } = {},
): Promise<string[]> {
  const sourceConfig = baiduConfigDirectory();
  if (!sourceConfig) throw new AppError("baiduNotConfigured");
  const configDirectory = path.join(workspace, "pcs");
  const downloads = path.join(workspace, "downloads");
  await mkdir(configDirectory, { mode: 0o700 });
  await mkdir(downloads);
  const configFile = path.join(configDirectory, "pcs_config.json");
  try {
    await copyFile(path.join(sourceConfig, "pcs_config.json"), configFile);
    await chmod(configFile, 0o600);
    const config = JSON.parse(await readFile(configFile, "utf8"));
    if (
      !config.baidu_active_uid ||
      !config.baidu_user_list?.some(
        (user: { uid: number; bduss?: string }) =>
          user.uid === config.baidu_active_uid && user.bduss,
      )
    )
      throw new Error("No active account");
  } catch {
    throw new AppError("baiduNotConfigured");
  }

  await run(["config", "set", "-savedir", downloads], configDirectory, {
    signal,
  });
  // A fresh cloud directory prevents numeric filenames from colliding.
  const remoteDirectory = `/ella-${randomUUID()}`;
  await run(["mkdir", remoteDirectory], configDirectory, { signal });
  await run(["cd", remoteDirectory], configDirectory, { signal });
  const config = JSON.parse(await readFile(configFile, "utf8"));
  if (
    config.savedir !== downloads ||
    !config.baidu_user_list?.some(
      (user: { uid: number; workdir: string }) =>
        user.uid === config.baidu_active_uid &&
        user.workdir === remoteDirectory,
    )
  )
    throw new AppError("baiduDownloadFailed");
  // The separately entered extraction code is authoritative over ?pwd=.
  const url = new URL(share.url);
  url.search = "";
  const output = await run(
    ["transfer", "--download", url.href, share.code],
    configDirectory,
    { onTransfer, signal },
  );
  if (!output.includes("下载结束")) throw new AppError("baiduDownloadFailed");
  const files = await listRegularFiles(downloads);
  if (files.length === 0) throw new AppError("baiduDownloadFailed");
  return files;
}
