import { getLocale } from "next-intl/server";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getTagSettings } from "@/lib/settingsStore";
import { buildVideoPrompt } from "@/lib/vision";

export const runtime = "nodejs";

export type PromptResponse = { prompt: string };

/** The recognition prompt as the current library and settings would build it. */
export async function GET() {
  const prompt = buildVideoPrompt(db, null, undefined, {
    settings: getTagSettings(),
    uiLocale: await getLocale(),
  });
  return NextResponse.json({ prompt } satisfies PromptResponse);
}
