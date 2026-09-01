import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const total = (
    db
      .prepare("SELECT COUNT(*) c FROM videos WHERE duration_sec IS NOT NULL")
      .get() as {
      c: number;
    }
  ).c;
  // Counted over the same videos as `total`. A video with no duration is one
  // the tagging pass never picks up, so letting it into the numerator alone
  // pushes the figure past the total it is measured against.
  const tagged = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT vt.video_id) c
         FROM video_tags vt
         JOIN videos v ON v.id = vt.video_id
         WHERE vt.status = 'active' AND v.duration_sec IS NOT NULL`,
      )
      .get() as { c: number }
  ).c;

  return NextResponse.json({
    total,
    tagged,
    done: total > 0 && tagged >= total,
  });
}
