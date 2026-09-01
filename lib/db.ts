import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DB_PATH } from "./config";
import { normalizeName } from "./names";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  mtime INTEGER NOT NULL,
  thumbnail TEXT,
  created_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0
);

-- parent_id builds a tree. A video is tagged with the exact tag it earns; the
-- parent is what makes one query reach every tag beneath it.
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  -- 0 marks a tag that only groups others: it cannot be put on a video, so
  -- the videos reach it through its children instead.
  assignable INTEGER NOT NULL DEFAULT 1,
  -- excluded | automatic | approved | category. This is a property of the
  -- tag itself; video_tags.source remains the provenance of one association.
  review_state TEXT NOT NULL DEFAULT 'approved',
  clicks INTEGER NOT NULL DEFAULT 0,
  parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL
);

-- Alternate spellings. Either an alias or the tag it stands for can be typed
-- or produced by the model, and the video still stores the tag. An alias is
-- never attached to a video: it exists for autocomplete and for search.
CREATE TABLE IF NOT EXISTS tag_aliases (
  alias TEXT PRIMARY KEY,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
);

-- A video belongs to at most one series (videos.series_id, nullable). The
-- CHECK keeps a blank name from ever being stored — absent means NULL.
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

-- status: 'active' = the tag applies to this video.
--         'rejected' = a generated tag the user removed. Kept (not deleted) so
--         re-generation can feed it back to the model as a negative example.
CREATE TABLE IF NOT EXISTS video_tags (
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'vision',
  status TEXT NOT NULL DEFAULT 'active',
  PRIMARY KEY (video_id, tag_id)
);

-- Background work the UI queued: one row per task, kept after it finishes so
-- the queue page can show what ran. The server owns execution (see
-- lib/taskRunner.ts); this table is the record of it, which is what lets a
-- task survive a restart mid-run.
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  -- What the queue page shows. Written once, so a later rename of the thing
  -- the task acts on does not rewrite history.
  title TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  -- queued | running | succeeded | failed | canceled
  status TEXT NOT NULL DEFAULT 'queued',
  processed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

-- Key/value settings edited from the UI. Kept in the DB rather than a config
-- file so the batch job reads exactly what the settings page wrote.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_tag_aliases_tag ON tag_aliases(tag_id);
`);

const videoColumns = db.prepare("PRAGMA table_info(videos)").all() as {
  name: string;
}[];
if (!videoColumns.some((c) => c.name === "views")) {
  db.exec("ALTER TABLE videos ADD COLUMN views INTEGER NOT NULL DEFAULT 0");
}

const tagColumns = db.prepare("PRAGMA table_info(tags)").all() as {
  name: string;
}[];
if (!tagColumns.some((c) => c.name === "clicks")) {
  db.exec("ALTER TABLE tags ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0");
}

if (!tagColumns.some((c) => c.name === "assignable")) {
  db.exec(
    "ALTER TABLE tags ADD COLUMN assignable INTEGER NOT NULL DEFAULT 1",
  );
}
if (!tagColumns.some((c) => c.name === "review_state")) {
  db.exec(
    "ALTER TABLE tags ADD COLUMN review_state TEXT NOT NULL DEFAULT 'approved'",
  );
  db.exec(`
    UPDATE tags
    SET review_state = CASE
      WHEN assignable = 0 THEN 'category'
      WHEN EXISTS (
        SELECT 1 FROM video_tags vt
        WHERE vt.tag_id = tags.id
          AND vt.source = 'manual'
          AND vt.status = 'active'
      ) THEN 'approved'
      WHEN EXISTS (
        SELECT 1 FROM video_tags vt
        WHERE vt.tag_id = tags.id
          AND vt.source = 'vision'
          AND vt.status = 'active'
      ) THEN 'automatic'
      WHEN EXISTS (
        SELECT 1 FROM video_tags vt
        WHERE vt.tag_id = tags.id AND vt.status = 'rejected'
      ) THEN 'excluded'
      ELSE 'approved'
    END
  `);
}
if (!tagColumns.some((c) => c.name === "parent_id")) {
  db.exec(
    "ALTER TABLE tags ADD COLUMN parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL",
  );
}

if (!videoColumns.some((c) => c.name === "series_id")) {
  db.exec(
    "ALTER TABLE videos ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL",
  );
}

// Which second the current thumbnail was taken from, so reopening the edit
// dialog puts the scrubber back where it was left rather than at the default.
if (!videoColumns.some((c) => c.name === "thumbnail_sec")) {
  db.exec("ALTER TABLE videos ADD COLUMN thumbnail_sec REAL");
}

// A download address was briefly kept here to recognise a repeated download.
// It identifies a transfer rather than a video, so it decided nothing and is
// removed where a run of that code added it.
if (videoColumns.some((c) => c.name === "source_url")) {
  db.exec("DROP INDEX IF EXISTS idx_videos_source");
  db.exec("ALTER TABLE videos DROP COLUMN source_url");
}

const videoTagColumns = db.prepare("PRAGMA table_info(video_tags)").all() as {
  name: string;
}[];
if (!videoTagColumns.some((c) => c.name === "status")) {
  db.exec(
    "ALTER TABLE video_tags ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  );
}
// Indexed after the migration above: on a pre-existing DB the column does not
// exist yet while the CREATE TABLE block runs.
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_video_tags_status ON video_tags(video_id, status)",
);

// A manual active association means a human approved the tag. Keep this rule
// at the database boundary so API routes, scripts, and task workers agree.
db.exec(`
CREATE TRIGGER IF NOT EXISTS approve_tag_from_manual_insert
AFTER INSERT ON video_tags
WHEN NEW.source = 'manual' AND NEW.status = 'active'
BEGIN
  UPDATE tags SET review_state = 'approved'
  WHERE id = NEW.tag_id AND review_state != 'category';
END;

CREATE TRIGGER IF NOT EXISTS approve_tag_from_manual_update
AFTER UPDATE OF source, status ON video_tags
WHEN NEW.source = 'manual' AND NEW.status = 'active'
BEGIN
  UPDATE tags SET review_state = 'approved'
  WHERE id = NEW.tag_id AND review_state != 'category';
END;
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_videos_series ON videos(series_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, id)");

// Series names follow the same spelling rule as tag names. Rows written before
// that rule existed are brought in line here. Two spellings that normalize
// onto one name were always the same series, so the videos are moved onto the
// surviving row rather than the rename failing on the UNIQUE index.
const seriesRows = db.prepare("SELECT id, name FROM series").all() as {
  id: number;
  name: string;
}[];
const strayNames = seriesRows.filter(
  (row) => row.name !== normalizeName(row.name),
);
if (strayNames.length > 0) {
  const idByName = new Map(seriesRows.map((row) => [row.name, row.id]));
  const renameSeries = db.prepare("UPDATE series SET name = ? WHERE id = ?");
  const moveVideos = db.prepare(
    "UPDATE videos SET series_id = ? WHERE series_id = ?",
  );
  const dropSeries = db.prepare("DELETE FROM series WHERE id = ?");

  db.transaction(() => {
    for (const row of strayNames) {
      const name = normalizeName(row.name);
      const existing = idByName.get(name);
      if (existing !== undefined && existing !== row.id) {
        moveVideos.run(existing, row.id);
        dropSeries.run(row.id);
        continue;
      }
      renameSeries.run(name, row.id);
      idByName.set(name, row.id);
    }
  })();
}

// Tag names and aliases share one namespace. Were a name allowed to exist as
// both, resolution would redirect a real tag to a different one and the videos
// already carrying it would become unreachable. Enforced here rather than in
// the routes so a script cannot write around it.
db.exec(`
CREATE TRIGGER IF NOT EXISTS tag_alias_conflicts_with_tag
BEFORE INSERT ON tag_aliases
BEGIN
  SELECT RAISE(ABORT, 'alias is already a tag name')
  WHERE EXISTS (SELECT 1 FROM tags WHERE name = NEW.alias);
END;

CREATE TRIGGER IF NOT EXISTS tag_name_conflicts_with_alias
BEFORE INSERT ON tags
BEGIN
  SELECT RAISE(ABORT, 'tag name is already an alias')
  WHERE EXISTS (SELECT 1 FROM tag_aliases WHERE alias = NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_rename_conflicts_with_alias
BEFORE UPDATE OF name ON tags
BEGIN
  SELECT RAISE(ABORT, 'tag name is already an alias')
  WHERE EXISTS (SELECT 1 FROM tag_aliases WHERE alias = NEW.name);
END;
`);

// Series share that namespace. A name in both is the same fact recorded twice,
// which leaves a video carrying it as a series and as a tag, and two places to
// edit when it changes.
db.exec(`
CREATE TRIGGER IF NOT EXISTS series_name_conflicts_with_tag
BEFORE INSERT ON series
BEGIN
  SELECT RAISE(ABORT, 'series name is already a tag or alias')
  WHERE EXISTS (SELECT 1 FROM tags WHERE name = NEW.name)
     OR EXISTS (SELECT 1 FROM tag_aliases WHERE alias = NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS series_rename_conflicts_with_tag
BEFORE UPDATE OF name ON series
BEGIN
  SELECT RAISE(ABORT, 'series name is already a tag or alias')
  WHERE EXISTS (SELECT 1 FROM tags WHERE name = NEW.name)
     OR EXISTS (SELECT 1 FROM tag_aliases WHERE alias = NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_name_conflicts_with_series
BEFORE INSERT ON tags
BEGIN
  SELECT RAISE(ABORT, 'tag name is already a series')
  WHERE EXISTS (SELECT 1 FROM series WHERE name = NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_rename_conflicts_with_series
BEFORE UPDATE OF name ON tags
BEGIN
  SELECT RAISE(ABORT, 'tag name is already a series')
  WHERE EXISTS (SELECT 1 FROM series WHERE name = NEW.name);
END;

CREATE TRIGGER IF NOT EXISTS alias_conflicts_with_series
BEFORE INSERT ON tag_aliases
BEGIN
  SELECT RAISE(ABORT, 'alias is already a series')
  WHERE EXISTS (SELECT 1 FROM series WHERE name = NEW.alias);
END;
`);

// A backstop under lib/names.ts, which is what actually normalizes a name on
// the way in. SQLite's lower() only folds ASCII, so this catches the cases a
// hand-written statement realistically introduces rather than every one the
// rule covers.
db.exec(`
CREATE TRIGGER IF NOT EXISTS series_name_is_normalized_on_insert
BEFORE INSERT ON series
BEGIN
  SELECT RAISE(ABORT, 'series name must be lowercase with no spaces')
  WHERE NEW.name <> lower(NEW.name)
     OR NEW.name <> trim(NEW.name)
     OR NEW.name LIKE '% %';
END;

CREATE TRIGGER IF NOT EXISTS series_name_is_normalized_on_rename
BEFORE UPDATE OF name ON series
BEGIN
  SELECT RAISE(ABORT, 'series name must be lowercase with no spaces')
  WHERE NEW.name <> lower(NEW.name)
     OR NEW.name <> trim(NEW.name)
     OR NEW.name LIKE '% %';
END;
`);

export default db;
