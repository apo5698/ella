import fs from "node:fs";
import nodePath from "node:path";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { VIDEO_ROOT } from "@/lib/config";
import { sortTags } from "@/lib/tagOrder";
import { loadVideoTagState, replaceVideoTagState } from "@/lib/tags";
import { enqueueTagPromotion } from "@/lib/taskRunner";
import type { VideoTagState } from "@/lib/types";
import {
  clampThumbSec,
  grabFrame,
  removeThumbnail,
  writeThumbnail,
} from "@/lib/thumbnail";

export const runtime = "nodejs";

type Row = {
  id: number;
  path: string;
  duration_sec: number | null;
  title: string;
};

/**
 * What "delete" was asked for. The record always goes; these differ only in
 * what happens to the file behind it.
 */
export type DeleteMode = "record" | "file" | "trash";

/** Dot-prefixed, which is what the scan skips, so trashed files stay gone. */
const TRASH_DIR = nodePath.join(VIDEO_ROOT, ".trash");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(id);
  if (!video) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const tags = db
    .prepare(
      `SELECT t.name, vt.source FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
       WHERE vt.video_id = ? AND vt.status = 'active'
       ORDER BY (vt.source = 'manual') DESC, t.name ASC`,
    )
    .all(id) as { name: string; source: string }[];
  return NextResponse.json({
    ...video,
    tags: sortTags(tags),
    tagState: loadVideoTagState(db, Number(id)),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db
    .prepare("SELECT id, path, duration_sec, title FROM videos WHERE id = ?")
    .get(id) as Row | undefined;
  if (!row)
    return NextResponse.json({ error: "视频记录不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const nextPath =
    typeof body.path === "string" && body.path.trim()
      ? body.path.trim()
      : row.path;

  if (nextPath !== row.path) {
    const owner = db
      .prepare(
        "SELECT id, title FROM videos WHERE path = ? AND id != ? LIMIT 1",
      )
      .get(nextPath, row.id) as { id: number; title: string } | undefined;
    if (owner) {
      return NextResponse.json(
        { error: `该路径已被视频"${owner.title}"占用` },
        { status: 409 },
      );
    }
  }

  // An empty name means "call it whatever the file is called", which is also
  // what the scan does when it first records a video.
  const typed = typeof body.title === "string" ? body.title.trim() : row.title;
  const nextTitle =
    typed || nodePath.basename(nextPath, nodePath.extname(nextPath));

  let thumbnail: string | null = null;
  let thumbnailSec: number | null = null;
  if (typeof body.thumbnailSec === "number") {
    // Decoded from the new path, so fixing a path and choosing a frame can
    // happen in the same save.
    thumbnailSec = clampThumbSec(body.thumbnailSec, row.duration_sec);
    const jpeg = await grabFrame(nextPath, thumbnailSec);
    if (!jpeg) {
      return NextResponse.json(
        { error: "无法读取该位置的画面，请调整封面位置后重试" },
        { status: 422 },
      );
    }
    thumbnail = writeThumbnail(row.id, jpeg);
  }

  const tagState = body.tagState as VideoTagState | undefined;
  let promotionIds: number[] = [];
  try {
    db.transaction(() => {
      if (thumbnail) {
        db.prepare(
          "UPDATE videos SET title = ?, path = ?, thumbnail = ?, thumbnail_sec = ? WHERE id = ?",
        ).run(nextTitle, nextPath, thumbnail, thumbnailSec, row.id);
      } else {
        db.prepare("UPDATE videos SET title = ?, path = ? WHERE id = ?").run(
          nextTitle,
          nextPath,
          row.id,
        );
      }
      if (tagState) {
        promotionIds = replaceVideoTagState(db, row.id, tagState);
      }
    })();
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "标签保存失败" },
      { status: 400 },
    );
  }

  for (const tagId of promotionIds) enqueueTagPromotion(db, tagId);

  return NextResponse.json({
    ok: true,
    title: nextTitle,
    path: nextPath,
    thumbnail,
    thumbnailSec,
    tagState: tagState ? loadVideoTagState(db, row.id) : undefined,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db
    .prepare("SELECT id, path, duration_sec, title FROM videos WHERE id = ?")
    .get(id) as Row | undefined;
  if (!row)
    return NextResponse.json({ error: "视频记录不存在" }, { status: 404 });

  const mode = (new URL(req.url).searchParams.get("mode") ??
    "record") as DeleteMode;
  if (mode !== "record" && mode !== "file" && mode !== "trash") {
    return NextResponse.json({ error: "删除方式无效" }, { status: 400 });
  }

  let fileNote: string | null = null;

  if (mode !== "record") {
    try {
      if (mode === "file") {
        fs.unlinkSync(row.path);
      } else {
        fs.mkdirSync(TRASH_DIR, { recursive: true });
        const target = nodePath.join(
          TRASH_DIR,
          `${row.id}-${nodePath.basename(row.path)}`,
        );
        try {
          fs.renameSync(row.path, target);
        } catch (err) {
          // A rename cannot cross filesystems, and the path field allows a
          // video to sit on a different volume than the root the trash lives
          // under. Copying costs the size of the file but always works.
          if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
          fs.copyFileSync(row.path, target);
          fs.unlinkSync(row.path);
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Already absent is the state that was asked for, so the record still
      // goes. Anything else, including an unmounted volume, must not leave the
      // file behind with no record pointing at it.
      if (code !== "ENOENT") {
        return NextResponse.json(
          { error: `文件操作失败：${(err as Error).message}` },
          { status: 500 },
        );
      }
      fileNote = "文件本就不存在";
    }
  }

  // video_tags clears itself: the foreign key is declared ON DELETE CASCADE
  // and foreign key enforcement is on.
  db.prepare("DELETE FROM videos WHERE id = ?").run(row.id);
  removeThumbnail(row.id);

  return NextResponse.json({ ok: true, mode, fileNote });
}
