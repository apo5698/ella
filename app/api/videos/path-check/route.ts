// Tells the edit dialog whether a path is free before it is saved. The unique
// thing worth blocking on is another record already claiming it; whether a
// file is actually there is reported too, since a path with nothing behind it
// produces a video that cannot play.
import fs from "node:fs";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";

export type PathCheck = {
  path: string;
  taken: boolean;
  takenBy: { id: number; title: string } | null;
  exists: boolean;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("path") ?? "";
  const path = raw.trim();
  // The record being edited holds its own path and must not report a clash
  // with itself.
  const selfId = Number(url.searchParams.get("id") ?? "0");

  if (!path) {
    return NextResponse.json<PathCheck>({
      path,
      taken: false,
      takenBy: null,
      exists: false,
    });
  }

  const owner = db
    .prepare("SELECT id, title FROM videos WHERE path = ? AND id != ? LIMIT 1")
    .get(path, Number.isFinite(selfId) ? selfId : 0) as
    { id: number; title: string } | undefined;

  let exists = false;
  try {
    exists = fs.statSync(path).isFile();
  } catch {
    // Missing, unreadable, or the volume is not attached.
  }

  return NextResponse.json<PathCheck>({
    path,
    taken: Boolean(owner),
    takenBy: owner ?? null,
    exists,
  });
}
