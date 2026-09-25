import { errorMessage } from "@/lib/appError";
import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { deleteFinishedJobsOfKind, notifyJobsChanged } from "@/lib/jobs";
import { enqueueDownload } from "@/lib/taskRunner";
import { findDownloadConflict } from "@/lib/utilities/downloadImport";
import { listDownloads } from "@/lib/utilities/downloadJobs";
import {
  DOWNLOAD_SCHEMAS,
  isDownloaderSource,
} from "@/lib/utilities/downloadSchemas";
import type { DownloadFailure } from "@/lib/utilities/downloadTypes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json(listDownloads(db, query));
}

/** Clears settled downloads from the history. Videos are not touched. */
export async function DELETE() {
  const count = deleteFinishedJobsOfKind(db, "VIDEO_DOWNLOAD");
  if (count > 0) notifyJobsChanged();
  return Response.json({ ok: true, count });
}

/**
 * Adds a download and answers at once. The transfer belongs to the task
 * runner, so it outlives the page that asked for it.
 *
 * Everything that can be known before a byte is fetched is checked here, so
 * a refusal reaches the form instead of becoming a failed task.
 */
export async function POST(request: Request) {
  const errors = await getTranslations("Api");
  const body = (await request.json().catch(() => null)) as {
    source?: unknown;
    start?: unknown;
    fields?: unknown;
  } | null;
  if (!isDownloaderSource(body?.source)) {
    return Response.json(
      { error: errors("invalidParameters") },
      { status: 400 },
    );
  }
  const parsed = DOWNLOAD_SCHEMAS[body.source](errors).safeParse(body.fields);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? errors("invalidParameters") },
      { status: 400 },
    );
  }

  const conflict = findDownloadConflict(parsed.data);
  if (conflict) {
    return Response.json(
      {
        error: errorMessage(conflict.error, errors),
        reason: conflict.reason,
        video: conflict.video,
      } satisfies DownloadFailure,
      { status: 409 },
    );
  }

  const id = enqueueDownload(db, body.source, parsed.data, {
    start: body.start !== false,
  });
  if (id === null) {
    return Response.json(
      {
        error: errors("downloadQueued"),
        reason: "name",
        video: null,
      } satisfies DownloadFailure,
      { status: 409 },
    );
  }
  return Response.json({ id }, { status: 202 });
}
