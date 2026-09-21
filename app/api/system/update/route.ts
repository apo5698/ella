import { version } from "@/package.json";
import { getLatestRelease, compareVersions } from "@/lib/releases";
import { callUpdater } from "@/lib/updater";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const currentVersion = process.env.APP_VERSION || version;
  try {
    return json({
      currentVersion,
      available: true,
      update: await callUpdater("GET"),
    });
  } catch {
    return json({ currentVersion, available: false, update: null });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(
      origin && new URL(origin).host === request.headers.get("host"),
    );
  } catch {}
  if (!sameOrigin) {
    return json({ error: "更新请求来源无效。" }, 403);
  }
  const release = await getLatestRelease(true);
  if (release.status !== "available")
    return json({ error: "无法获取最新版本，请稍后重试。" }, 502);
  const current = process.env.APP_VERSION || version;
  const comparison = compareVersions(current, release.version);
  if (comparison === null || comparison >= 0)
    return json({ error: "当前没有可安装的新版本。" }, 409);
  try {
    return json({ update: await callUpdater("POST", release.version) }, 202);
  } catch {
    return json({ error: "无法连接更新服务，请稍后重试。" }, 503);
  }
}
