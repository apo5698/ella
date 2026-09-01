import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { resolveTagName, tagPath } from "@/lib/tagHierarchy";

/** Un-rejects a tag the user had removed, making it active again. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "")
    .trim()
    .toLowerCase();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  db.prepare(
    `UPDATE video_tags SET status = 'active'
     WHERE video_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)`,
  ).run(Number(id), name);

  // The ancestors go back with it so the restored chip rejoins its family
  // without a reload.
  const resolved = resolveTagName(db, name);
  return NextResponse.json({
    ok: true,
    id: resolved.id,
    path: resolved.id === null ? [name] : tagPath(db, resolved.id),
  });
}
