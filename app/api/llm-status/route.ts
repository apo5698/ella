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
  const settings = getLlmSettings();
  return NextResponse.json({ settings, probe: await probeLlm(settings.url) });
}

/** Probes an address without saving it, so a value can be tried before commit. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "地址不能为空" }, { status: 400 });
  }
  return NextResponse.json({ probe: await probeLlm(url) });
}

/** Saves the address and model, then reports the state of the saved address. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = saveLlmSettings({
    url: typeof body.url === "string" ? body.url : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
  });
  return NextResponse.json({ settings, probe: await probeLlm(settings.url) });
}
