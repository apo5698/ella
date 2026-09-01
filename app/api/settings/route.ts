import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { TagSettings } from "@/lib/settings";
import { getTagSettings, saveTagSettings } from "@/lib/settingsStore";
import { frameBudget } from "@/lib/vision";

export const runtime = "nodejs";

export type SettingsResponse = {
  settings: TagSettings;
  /** Videos still awaiting a vision tag, and what processing them costs. */
  pending: {
    count: number;
    seconds: number;
    /** Frames the automatic budget would produce across all of them. */
    autoFrames: number;
  };
};

// Drives the cost estimate on the settings page: scene detection decodes every
// one of these seconds, so the figure is what the strategy choice is worth.
function pending() {
  const rows = db
    .prepare(
      `SELECT duration_sec FROM videos
       WHERE duration_sec IS NOT NULL
         AND id NOT IN (
           SELECT video_id FROM video_tags WHERE source = 'vision' AND status = 'active'
         )`,
    )
    .all() as { duration_sec: number }[];

  let seconds = 0;
  let autoFrames = 0;
  for (const row of rows) {
    seconds += row.duration_sec;
    // Taken from the real budget function rather than restating its tiers, so
    // the estimate cannot drift away from what extraction actually does.
    autoFrames += frameBudget(row.duration_sec);
  }
  return { count: rows.length, seconds: Math.round(seconds), autoFrames };
}


export async function GET() {
  const settings = getTagSettings();
  return NextResponse.json({
    settings,
    pending: pending(),
  });
}

/** Accepts a partial patch; unknown or out-of-range values fall back to defaults. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = saveTagSettings(body);
  return NextResponse.json({
    settings,
    pending: pending(),
  });
}
