import { getTranslations } from "next-intl/server";
import { NextRequest, NextResponse } from "next/server";
import { probeLlm, type LlmProbe } from "@/lib/llm";
import { getLlmSettings, saveLlmSettings } from "@/lib/settingsStore";
import type { LlmSettings } from "@/lib/settings";

export const runtime = "nodejs";

export type LlmStatusResponse = {
  settings: LlmSettings;
  probe: LlmProbe;
};

/** Current settings, probed at the saved address. */
export async function GET() {
  const t = await getTranslations("Api");
  const settings = getLlmSettings();
  return NextResponse.json({
    settings,
    probe: localizeProbe(await probeLlm(settings.url), t),
  });
}

/** Probes an address without saving it, so a value can be tried before commit. */
export async function POST(req: NextRequest) {
  const t = await getTranslations("Api");
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: t("endpointRequired") }, { status: 400 });
  }
  return NextResponse.json({ probe: localizeProbe(await probeLlm(url), t) });
}

/** Saves the address and model, then reports the state of the saved address. */
export async function PUT(req: NextRequest) {
  const t = await getTranslations("Api");
  const body = await req.json().catch(() => ({}));
  const settings = saveLlmSettings({
    url: typeof body.url === "string" ? body.url : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
  });
  return NextResponse.json({
    settings,
    probe: localizeProbe(await probeLlm(settings.url), t),
  });
}

function localizeProbe(
  probe: LlmProbe,
  t: (
    key: "modelTimeout" | "modelUnavailable",
    values?: { seconds: number },
  ) => string,
): LlmProbe {
  return probe.errorCode === "modelTimeout"
    ? {
        ...probe,
        error: t("modelTimeout", { seconds: probe.timeoutSeconds ?? 0 }),
      }
    : probe.errorCode === "modelUnavailable"
      ? { ...probe, error: t("modelUnavailable") }
      : probe;
}
