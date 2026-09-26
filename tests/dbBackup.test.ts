import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  backupBeforeUpgrade,
  backupDirectory,
  recordAppVersion,
} from "../lib/dbBackup";

test("the catalog is copied once before each upgrade", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ella-db-backup-"));
  const dbPath = path.join(root, "catalog.db");
  const open = () => {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    return db;
  };
  const backups = async () =>
    (await readdir(backupDirectory(dbPath)).catch(() => [])).sort();
  try {
    let db = open();
    assert.equal(backupBeforeUpgrade(db, dbPath, "0.1.0"), null, "empty");
    db.exec("CREATE TABLE videos (id INTEGER PRIMARY KEY, title TEXT)");
    db.prepare("INSERT INTO videos (title) VALUES (?)").run("kept");
    recordAppVersion(db, "0.1.0");

    assert.equal(backupBeforeUpgrade(db, dbPath, undefined), null, "dev");
    assert.equal(backupBeforeUpgrade(db, dbPath, "0.1.0"), null, "same");
    assert.deepEqual(await backups(), []);

    // An upgrade whose migration fails is not copied a second time.
    const copy = backupBeforeUpgrade(db, dbPath, "0.2.0");
    assert.ok(copy);
    assert.match(
      path.basename(copy),
      /^catalog-\d{4}-.+-0\.1\.0-to-0\.2\.0\.db$/,
    );
    db.exec("ALTER TABLE videos ADD COLUMN half TEXT");
    db.close();
    db = open();
    assert.equal(backupBeforeUpgrade(db, dbPath, "0.2.0"), null);
    assert.equal((await backups()).length, 1);

    const saved = new Database(copy, { readonly: true });
    assert.deepEqual(saved.prepare("SELECT title FROM videos").all(), [
      { title: "kept" },
    ]);
    const columns = saved.prepare("PRAGMA table_info(videos)").all();
    assert.equal(columns.length, 2, "taken before the migration");
    saved.close();

    recordAppVersion(db, "0.2.0");
    assert.equal(backupBeforeUpgrade(db, dbPath, "0.2.0"), null);

    // Going back and forth copies again, and only the newest five stay.
    for (const version of ["0.3.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0"]) {
      assert.ok(backupBeforeUpgrade(db, dbPath, version));
      recordAppVersion(db, version);
    }
    const kept = await backups();
    assert.equal(kept.length, 5);
    assert.ok(!kept.some((name) => name.endsWith("-0.1.0-to-0.2.0.db")));
    assert.ok(!kept.some((name) => name.endsWith(".partial")));
    db.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
