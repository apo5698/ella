import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Copies of the catalog taken before a new release migrates it. Migrations run
 * when the database is opened and are not reversible, so the copy is what an
 * operator restores to go back to the previous release.
 */

/** Copies kept; older ones are removed once a new one is written. */
const KEEP_BACKUPS = 5;

const META_TABLE_SQL = `CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

export function backupDirectory(dbPath: string) {
  return path.join(path.dirname(dbPath), "backups");
}

function readMeta(db: Database.Database, key: string): string | null {
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
    )
    .get();
  if (!table) return null;
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeMeta(db: Database.Database, key: string, value: string | null) {
  db.exec(META_TABLE_SQL);
  if (value === null) db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
  else
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
}

function hasTables(db: Database.Database) {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1")
      .get() !== undefined
  );
}

/** Names start with the time taken, so name order is age order. */
function pruneBackups(directory: string, base: string) {
  const backups = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith(`${base}-`) && name.endsWith(".db"))
    .sort()
    .reverse();
  for (const name of backups.slice(KEEP_BACKUPS))
    fs.rmSync(path.join(directory, name));
}

/**
 * Before the schema is touched: when the release differs from the one that
 * last opened this database, writes a consistent copy to `backups/`. Returns
 * the copy's path, or null when none was needed.
 *
 * Without `version` (development, tests) nothing is copied. A failed copy
 * throws, so a database is never migrated without one.
 */
export function backupBeforeUpgrade(
  db: Database.Database,
  dbPath: string,
  version: string | undefined,
): string | null {
  if (!version || !hasTables(db)) return null;
  const previous = readMeta(db, "version") ?? "unknown";
  if (previous === version) return null;
  // A start that failed during this same upgrade already took the copy, and
  // the database it would copy now is half migrated.
  const upgrade = `${previous}->${version}`;
  if (readMeta(db, "upgrading") === upgrade) return null;

  const directory = backupDirectory(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(
    directory,
    `${base}-${stamp}-${previous}-to-${version}.db`,
  );
  fs.mkdirSync(directory, { recursive: true });
  const partial = `${target}.partial`;
  // VACUUM INTO reads one snapshot, WAL included, into a standalone file.
  db.prepare("VACUUM INTO ?").run(partial);
  fs.renameSync(partial, target);
  pruneBackups(directory, base);
  writeMeta(db, "upgrading", upgrade);
  return target;
}

/** After migrations: marks the database as belonging to this release. */
export function recordAppVersion(
  db: Database.Database,
  version: string | undefined,
) {
  if (!version) return;
  writeMeta(db, "version", version);
  writeMeta(db, "upgrading", null);
}
