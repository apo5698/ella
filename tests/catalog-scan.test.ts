import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("failed or empty directory scans preserve the catalog and thumbnails", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ella-scan-"));
  process.env.DB_PATH = path.join(scratch, "catalog.db");
  process.env.VIDEO_ROOT = path.join(scratch, "videos");
  process.env.THUMB_DIR = path.join(scratch, "thumbs");
  const { default: db } = await import("../lib/db");
  try {
    const { scanVideoCatalog } = await import("../lib/catalogScan");
    db.prepare(
      `INSERT INTO videos (path, filename, title, ext, size_bytes, mtime, created_at)
       VALUES (?, 'sample.mp4', 'Sample', '.mp4', 0, 0, 0)`,
    ).run(path.join(process.env.VIDEO_ROOT, "sample.mp4"));
    fs.mkdirSync(process.env.THUMB_DIR);
    const thumbnail = path.join(process.env.THUMB_DIR, "1.jpg");
    fs.writeFileSync(thumbnail, "placeholder");

    await assert.rejects(scanVideoCatalog(), /无法读取视频目录/);
    fs.mkdirSync(process.env.VIDEO_ROOT);
    await assert.rejects(scanVideoCatalog(), /未发现视频文件/);
    const count = db.prepare("SELECT COUNT(*) AS n FROM videos").get() as {
      n: number;
    };
    assert.equal(count.n, 1);
    assert.equal(fs.readFileSync(thumbnail, "utf8"), "placeholder");
  } finally {
    db.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
