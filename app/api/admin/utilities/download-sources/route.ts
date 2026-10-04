import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { isSameOrigin } from "@/lib/sameOrigin";
import {
  getDownloadSources,
  saveDownloadSources,
} from "@/lib/utilities/downloadSourceStore";
import { createDownloadSourcesSchema } from "@/lib/utilities/downloadSources";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export type DownloadSourcesResponse = {
  sources: ReturnType<typeof getDownloadSources>;
};

export type DownloadSourcesError = {
  error: string;
  /** One line per problem, each led by where in the JSON it is. */
  issues?: string[];
};

export async function GET() {
  return Response.json(
    { sources: getDownloadSources() } satisfies DownloadSourcesResponse,
    { headers },
  );
}

function issuePath(path: PropertyKey[]) {
  return path
    .map((key) => (typeof key === "number" ? `[${key}]` : `.${String(key)}`))
    .join("")
    .replace(/^\./, "");
}

/** Replaces the whole list with the JSON text the user saved. */
export async function PUT(request: Request) {
  const t = await getTranslations("Api");
  if (request.headers.get("origin") && !isSameOrigin(request))
    return Response.json(
      { error: t("invalidOrigin") } satisfies DownloadSourcesError,
      { status: 403, headers },
    );

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
  } | null;
  if (typeof body?.text !== "string" || body.text.length > 100_000)
    return Response.json(
      { error: t("invalidParameters") } satisfies DownloadSourcesError,
      { status: 400, headers },
    );

  let data: unknown;
  try {
    data = JSON.parse(body.text);
  } catch (cause) {
    return Response.json(
      {
        error: t("downloadSourcesNotJson"),
        issues: [cause instanceof Error ? cause.message : String(cause)],
      } satisfies DownloadSourcesError,
      { status: 400, headers },
    );
  }

  const locale = (await getLocale()).startsWith("zh")
    ? z.locales.zhCN()
    : z.locales.en();
  const parsed = createDownloadSourcesSchema(t).safeParse(data, {
    error: locale.localeError,
  });
  if (!parsed.success)
    return Response.json(
      {
        error: t("downloadSourcesInvalid"),
        issues: parsed.error.issues.map((issue) =>
          issue.path.length
            ? `${issuePath(issue.path)}: ${issue.message}`
            : issue.message,
        ),
      } satisfies DownloadSourcesError,
      { status: 400, headers },
    );

  saveDownloadSources(parsed.data);
  return Response.json(
    { sources: parsed.data } satisfies DownloadSourcesResponse,
    { headers },
  );
}
