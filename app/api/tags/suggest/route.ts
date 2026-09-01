import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { suggestTags, SUGGEST_LIMIT } from "@/lib/suggest";

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
  // Set by the fields that tag a video, which cannot use a grouping tag.
  const assignableOnly = searchParams.get("assignable") === "1";
  return NextResponse.json({
    suggestions: suggestTags(db, q, limit, assignableOnly),
  });
}
