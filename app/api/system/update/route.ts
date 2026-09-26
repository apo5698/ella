import { getTranslations } from "next-intl/server";
import { version } from "@/package.json";
import { getLatestRelease, compareVersions } from "@/lib/releases";
import { callUpdater, type UpdaterUnavailableReason } from "@/lib/updater";
import {
  holdTaskRunner,
  releaseTaskRunner,
  runningTaskCount,
} from "@/lib/taskRunner";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function unavailableReason(error: unknown): UpdaterUnavailableReason {
  if (process.env.NODE_ENV === "development") return "development";
  switch ((error as NodeJS.ErrnoException | null)?.code) {
    case "ENOENT":
      return "notInstalled";
    // The socket is there but nothing answers: the service has stopped.
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "EPIPE":
      return "notRunning";
    case "EACCES":
      return "permission";
    default:
      return "unreachable";
  }
}

export async function GET() {
  const currentVersion = process.env.APP_VERSION || version;
  try {
    const update = await callUpdater("GET");
    // An update that failed leaves this process running, so queued work
    // may start again.
    if (update.state === "failed" || update.state === "idle")
      releaseTaskRunner();
    return json({ currentVersion, available: true, update });
  } catch (error) {
    return json({
      currentVersion,
      available: false,
      update: null,
      reason: unavailableReason(error),
    });
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
  // The restart would cut running tasks off, and none of them can resume
  // where they stopped. Holding first means nothing starts after the check.
  holdTaskRunner();
  const running = runningTaskCount();
  if (running > 0) {
    releaseTaskRunner();
    return json({ error: t("updateBlockedByTasks", { count: running }) }, 409);
  }
  try {
    return json({ update: await callUpdater("POST", release.version) }, 202);
  } catch {
    releaseTaskRunner();
    return json({ error: t("updaterUnavailable") }, 503);
  }
}
