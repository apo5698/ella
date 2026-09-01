import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { suggestSeries, SUGGEST_LIMIT } from "@/lib/suggest";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(
    30,
    Math.max(
      1,
      parseInt(searchParams.get("limit") ?? String(SUGGEST_LIMIT), 10) ||
        SUGGEST_LIMIT,
    ),
  );
  return NextResponse.json({ suggestions: suggestSeries(db, q, limit) });
}
