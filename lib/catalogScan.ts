import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import { THUMB_DIR, VIDEO_ROOT } from "@/lib/config";
import { listVideoFiles, recordVideo } from "@/lib/videoCatalog";

export type CatalogScanProgress = {
  processed: number;
  total: number;
};

export type CatalogScanResult = {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
};

export async function scanVideoCatalog(
  options: {
    canceled?: () => boolean;
    onProgress?: (progress: CatalogScanProgress) => void;
  } = {},
): Promise<CatalogScanResult> {
  const canceled = options.canceled ?? (() => false);
  const files = listVideoFiles(VIDEO_ROOT);
  const dbPaths = db.prepare("SELECT id, path FROM videos").all() as {
    id: number;
    path: string;
  }[];
  const total = files.length + dbPaths.length;
  let processed = 0;
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let removed = 0;

  options.onProgress?.({ processed, total });

  for (const file of files) {
    if (canceled()) return { added, updated, skipped, removed };

    const result = recordVideo(file);
    if (result.status === "added") added += 1;
    else if (result.status === "updated") updated += 1;
    else skipped += 1;

    processed += 1;
    options.onProgress?.({ processed, total });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const filePaths = new Set(files);
  const deleteVideo = db.prepare("DELETE FROM videos WHERE id = ?");
  for (const row of dbPaths) {
    if (canceled()) return { added, updated, skipped, removed };

    if (!filePaths.has(row.path)) {
      deleteVideo.run(row.id);
      fs.rmSync(path.join(THUMB_DIR, `${row.id}.jpg`), { force: true });
      removed += 1;
    }

    processed += 1;
    options.onProgress?.({ processed, total });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return { added, updated, skipped, removed };
}
