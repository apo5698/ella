import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Import first in any test that can reach the database. Imports are hoisted,
 * so paths set inside a test arrive after lib/config and lib/db have already
 * read them, and the real library would be opened instead.
 */
export const scratch = mkdtempSync(path.join(tmpdir(), "ella-test-"));
process.env.DB_PATH = path.join(scratch, "catalog.db");
process.env.VIDEO_ROOT = path.join(scratch, "videos");
process.env.THUMB_DIR = path.join(scratch, "thumbs");
process.env.PREVIEW_DIR = path.join(scratch, "previews");
process.env.DOWNLOAD_WORK_DIR = path.join(scratch, "work");
