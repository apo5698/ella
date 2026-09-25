import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { path7za } from "7zip-bin";
import { DB_PATH, VIDEO_ROOT, FFMPEG_PATH, FFPROBE_PATH } from "@/lib/config";
import { AppError } from "@/lib/appError";

const exec = promisify(execFile);
export const baiduConfigDirectory = () =>
  process.env.BAIDUPCS_GO_CONFIG_DIR ||
  path.join(path.dirname(DB_PATH), "baidupcs");
const managedBinary = () =>
  path.join(baiduConfigDirectory(), "bin", "BaiduPCS-Go");
export async function baiduBinary() {
  if (process.env.BAIDUPCS_GO_PATH) return process.env.BAIDUPCS_GO_PATH;
  try {
    await access(managedBinary(), constants.X_OK);
    return managedBinary();
  } catch {
    return "BaiduPCS-Go";
  }
}
async function command(binary: string, args: string[], directory?: string) {
  const operation = exec(binary, args, {
    timeout: 45_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      ...(directory ? { BAIDUPCS_GO_CONFIG_DIR: directory } : {}),
    },
  });
  operation.child.stdin?.end();
  return (await operation).stdout;
}
async function account(directory = baiduConfigDirectory()) {
  try {
    const config = JSON.parse(
      await readFile(path.join(directory, "pcs_config.json"), "utf8"),
    );
    const user = config.baidu_user_list?.find(
      (u: { uid: number }) => u.uid === config.baidu_active_uid,
    );
    return user?.bduss &&
      (user.stoken || /(?:^|;\s*)STOKEN=/.test(user.cookies || ""))
      ? { name: String(user.name || "Baidu") }
      : null;
  } catch {
    return null;
  }
}
export type StorageIssue =
  "readOnly" | "permission" | "missing" | "unavailable";

export async function checkDownloadStorage(
  directory: string,
): Promise<StorageIssue | null> {
  try {
    await access(directory, constants.R_OK);
    const probe = await mkdtemp(path.join(directory, ".ella-write-check-"));
    await rm(probe, { recursive: true });
    return null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS") return "readOnly";
    if (code === "EACCES" || code === "EPERM") return "permission";
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    return "unavailable";
  }
}

export type BaiduSetupStatus = {
  installed: boolean;
  canInstall: boolean;
  mediaTools: boolean;
  storageWritable: boolean;
  storageIssue: StorageIssue | null;
  account: { name: string } | null;
};
export async function baiduSetupStatus(): Promise<BaiduSetupStatus> {
  const [installed, mediaTools, storageIssue, currentAccount] =
    await Promise.all([
      command(await baiduBinary(), ["--version"]).then(
        () => true,
        () => false,
      ),
      Promise.all([
        command(FFMPEG_PATH, ["-version"]),
        command(FFPROBE_PATH, ["-version"]),
        access(path7za),
      ]).then(
        () => true,
        () => false,
      ),
      checkDownloadStorage(VIDEO_ROOT),
      account(),
    ]);
  return {
    installed,
    canInstall:
      process.platform === "linux" &&
      ["x64", "arm64"].includes(process.arch) &&
      !process.env.BAIDUPCS_GO_PATH,
    mediaTools,
    storageWritable: storageIssue === null,
    storageIssue,
    account: currentAccount,
  };
}
const releases = {
  x64: {
    arch: "amd64",
    sha256: "b5f51388b510433668ca22fa5a1cb8840fb4d9725c5edc830554645010a62339",
  },
  arm64: {
    arch: "arm64",
    sha256: "d3568749f6475f9409b2d395466fa495133ca97f0582dbb15649a7074ed0b7fc",
  },
};
let installation: Promise<void> | undefined;
export function installBaidu() {
  if (installation) return installation;
  installation = (async () => {
    // Only create the default local library. An explicit media mount must
    // already exist so an unavailable mount is never mistaken for an empty one.
    if (!process.env.VIDEO_ROOT) await mkdir(VIDEO_ROOT, { recursive: true });
    await access(path7za, constants.X_OK).catch(() => chmod(path7za, 0o755));
    if ((await baiduSetupStatus()).installed) return;
    const release = releases[process.arch as keyof typeof releases];
    if (
      process.platform !== "linux" ||
      !release ||
      process.env.BAIDUPCS_GO_PATH
    )
      throw new AppError("baiduInstallUnsupported");
    const directory = baiduConfigDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const work = await mkdtemp(path.join(directory, ".install-"));
    try {
      const response = await fetch(
        `https://github.com/qjfoidnh/BaiduPCS-Go/releases/download/v4.0.2/BaiduPCS-Go-v4.0.2-linux-${release.arch}.zip`,
        { signal: AbortSignal.timeout(120_000) },
      );
      if (!response.ok || !response.body) throw new Error("Download failed");
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 64 * 1024 * 1024) throw new Error("Too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = Buffer.concat(chunks);
      if (createHash("sha256").update(bytes).digest("hex") !== release.sha256)
        throw new Error("Checksum mismatch");
      const archive = path.join(work, "release.zip");
      await writeFile(archive, bytes);
      await access(path7za, constants.X_OK).catch(() => chmod(path7za, 0o755));
      await command(path7za, [
        "e",
        "-y",
        "-r",
        `-o${work}`,
        archive,
        "BaiduPCS-Go",
      ]);
      const binary = path.join(work, "BaiduPCS-Go");
      await chmod(binary, 0o700);
      await command(binary, ["--version"]);
      await mkdir(path.dirname(managedBinary()), {
        recursive: true,
        mode: 0o700,
      });
      await rename(binary, managedBinary());
    } catch {
      throw new AppError("baiduInstallFailed");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  })().finally(() => {
    installation = undefined;
  });
  return installation;
}
export function normalizeBaiduCookies(value: string) {
  const cookies = value
    .trim()
    .replace(/^Cookie:\s*/i, "")
    .replace(/;?\s*$/, ";");
  if (
    cookies.length > 32_768 ||
    /[\r\n\u0000]/.test(cookies) ||
    !/(?:^|;\s*)BDUSS=[^;\s]+;/.test(cookies) ||
    !/(?:^|;\s*)STOKEN=[^;\s]+;/.test(cookies)
  )
    throw new AppError("baiduCookiesInvalid");
  return cookies;
}
export async function connectBaidu(value: string) {
  const cookies = normalizeBaiduCookies(value);
  const directory = baiduConfigDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(path.join(directory, ".login-"));
  try {
    const binary = await baiduBinary();
    await command(binary, ["login", `-cookies=${cookies}`], work);
    if (!(await account(work))) throw new Error("Login failed");
    const quota = await command(binary, ["quota"], work);
    if (!quota.includes("总空间:")) throw new Error("Verification failed");
    const candidate = path.join(work, "pcs_config.json");
    await chmod(candidate, 0o600);
    // Only replace working credentials after successful verification.
    await rename(candidate, path.join(directory, "pcs_config.json"));
  } catch {
    throw new AppError("baiduLoginFailed");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
export async function verifyBaidu() {
  const directory = baiduConfigDirectory();
  const work = await mkdtemp(path.join(directory, ".verify-"));
  try {
    await copyFile(
      path.join(directory, "pcs_config.json"),
      path.join(work, "pcs_config.json"),
    );
    const output = await command(await baiduBinary(), ["quota"], work);
    if (!output.includes("总空间:") || !(await account(work)))
      throw new Error("Invalid account");
  } catch {
    throw new AppError("baiduLoginFailed");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
