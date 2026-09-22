import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("Api");
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(
      origin && new URL(origin).host === request.headers.get("host"),
    );
  } catch {}
  if (!sameOrigin) {
    return json({ error: t("invalidUpdateOrigin") }, 403);
  }
  const release = await getLatestRelease(true);
  if (release.status !== "available")
    return json({ error: t("releaseUnavailable") }, 502);
  const current = process.env.APP_VERSION || version;
  const comparison = compareVersions(current, release.version);
  if (comparison === null || comparison >= 0)
    return json({ error: t("noUpdate") }, 409);
  try {
    return json({ update: await callUpdater("POST", release.version) }, 202);
  } catch {
    return json({ error: t("updaterUnavailable") }, 503);
  }
}
