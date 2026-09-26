import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DB_PATH } from "./config";
import { backupBeforeUpgrade, recordAppVersion } from "./dbBackup";
import { normalizeName } from "./names";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const backup = backupBeforeUpgrade(db, DB_PATH, process.env.APP_VERSION);
if (backup)
  console.log(`[db] Backed up the catalog before upgrading: ${backup}`);

const tableExists = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
);
const hasLegacyTasksTable = tableExists.get("tasks") !== undefined;
const hasNotificationsTable = tableExists.get("notifications") !== undefined;
const hasMigrationTable = tableExists.get("notifications_legacy") !== undefined;

if (hasLegacyTasksTable && hasNotificationsTable) {
  throw new Error(
    "Database migration cannot continue while both tasks and notifications tables exist",
  );
}
if (hasLegacyTasksTable) {
  if (hasMigrationTable) {
    throw new Error(
      "Database migration table notifications_legacy already exists",
    );
  }
  db.exec("ALTER TABLE tasks RENAME TO notifications_legacy");
} else if (hasNotificationsTable) {
  const columns = db.prepare("PRAGMA table_info(notifications)").all() as {
    name: string;
  }[];
  const names = new Set(columns.map(({ name }) => name));
  const isPureNotificationTable =
    names.has("type") &&
    names.has("payload") &&
    names.has("is_read") &&
    !names.has("status") &&
    !names.has("processed") &&
    !names.has("total") &&
    !names.has("outcome");
  if (!isPureNotificationTable) {
    if (hasMigrationTable) {
      throw new Error(
        "Database migration table notifications_legacy already exists",
      );
    }
    db.exec("ALTER TABLE notifications RENAME TO notifications_legacy");
  }
}

const NOTIFICATIONS_TABLE_SQL = `
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type = upper(type)),
  payload TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
  is_read BOOLEAN NOT NULL DEFAULT FALSE CHECK (is_read IN (FALSE, TRUE)),
  created_at INTEGER NOT NULL
);`;

const BACKGROUND_JOBS_TABLE_SQL = `
CREATE TABLE background_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind = upper(kind)),
  payload TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'canceled')
  ),
  processed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  outcome TEXT CHECK (outcome IS NULL OR json_valid(outcome)),
  progress TEXT CHECK (progress IS NULL OR json_valid(progress)),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);`;

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
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0
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

-- Notifications are immutable user-facing events. type selects presentation
-- and localized copy; payload contains interpolation values only.
${NOTIFICATIONS_TABLE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

-- Operational state belongs to the worker, not to the notification center.
${BACKGROUND_JOBS_TABLE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

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
if (!videoColumns.some((c) => c.name === "clicks")) {
  db.exec("ALTER TABLE videos ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0");
}

const tagColumns = db.prepare("PRAGMA table_info(tags)").all() as {
  name: string;
}[];
if (!tagColumns.some((c) => c.name === "clicks")) {
  db.exec("ALTER TABLE tags ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0");
}

if (!tagColumns.some((c) => c.name === "assignable")) {
  db.exec("ALTER TABLE tags ADD COLUMN assignable INTEGER NOT NULL DEFAULT 1");
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

// Structured progress for tasks whose state is richer than a count, such as
// a download moving from transfer to extraction.
const jobColumns = db.prepare("PRAGMA table_info(background_jobs)").all() as {
  name: string;
}[];
if (!jobColumns.some((c) => c.name === "progress")) {
  db.exec(
    "ALTER TABLE background_jobs ADD COLUMN progress TEXT CHECK (progress IS NULL OR json_valid(progress))",
  );
}

// 'pending' is a task parked until someone starts it. SQLite cannot alter a
// CHECK constraint, so a table from before it existed is rebuilt.
const jobsTableSql = (
  db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'background_jobs'",
    )
    .get() as { sql: string }
).sql;
if (!jobsTableSql.includes("'pending'")) {
  db.transaction(() => {
    db.exec(
      BACKGROUND_JOBS_TABLE_SQL.replace(
        "background_jobs",
        "background_jobs_next",
      ),
    );
    db.exec(`
      INSERT INTO background_jobs_next (
        id, kind, payload, status, processed, total, outcome, progress,
        created_at, started_at, finished_at
      )
      SELECT id, kind, payload, status, processed, total, outcome, progress,
        created_at, started_at, finished_at
      FROM background_jobs;
      DROP TABLE background_jobs;
      ALTER TABLE background_jobs_next RENAME TO background_jobs;
    `);
  })();
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

if (tableExists.get("notifications_legacy") !== undefined) {
  type LegacyNotification = {
    id: number;
    kind: string | null;
    type: string | null;
    event: string | null;
    title: string | null;
    payload: string | null;
    args: string | null;
    status: string | null;
    processed: number;
    total: number;
    result: string | null;
    outcome: string | null;
    isRead: number;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
  };

  const columns = db
    .prepare("PRAGMA table_info(notifications_legacy)")
    .all() as { name: string }[];
  const names = new Set(columns.map(({ name }) => name));
  const select = (name: string, fallback = "NULL") =>
    names.has(name) ? name : `${fallback} AS ${name}`;
  const legacyRows = db
    .prepare(
      `SELECT id,
       ${select("kind")}, ${select("type")}, ${select("event")},
       ${select("title")}, ${select("payload")}, ${select("args")},
       ${select("status")}, ${select("processed", "0")},
       ${select("total", "0")}, ${select("result")}, ${select("outcome")},
       ${names.has("is_read") ? "is_read" : "1"} AS isRead,
       created_at AS createdAt,
       ${names.has("started_at") ? "started_at" : "NULL"} AS startedAt,
       ${names.has("finished_at") ? "finished_at" : "NULL"} AS finishedAt
       FROM notifications_legacy`,
    )
    .all() as LegacyNotification[];

  const parseObject = (value: string | null) => {
    if (!value) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const legacyType = (row: LegacyNotification) => {
    const key = row.event ?? row.type ?? row.kind ?? "ERROR";
    if (key === "promote-tag-source") return "TAG_APPROVAL";
    if (key === "retag-video") return "VIDEO_RETAG";
    if (key === "scan-video-catalog") return "VIDEO_CATALOG_SCAN";
    if (key === "DUMMY_LONG_MESSAGE") return "WARNING";
    return key.toUpperCase();
  };
  const legacyPayload = (row: LegacyNotification) => {
    const payload = parseObject(row.args ?? row.payload);
    if (row.kind === "promote-tag-source" && row.title) {
      const match = row.title.match(/^将"(.+)"转为已审核标签（(\d+) 个视频）$/);
      if (match) {
        payload.tagName ??= match[1];
        payload.pending ??= Number(match[2]);
      }
    }
    if (row.kind === "retag-video" && row.title) {
      const match = row.title.match(/^重新识别"(.+)"的标签$/);
      if (match) payload.videoTitle ??= match[1];
    }
    return payload;
  };
  const legacyOutcome = (row: LegacyNotification) => {
    const structured = parseObject(row.outcome);
    if (Object.keys(structured).length > 0 || !row.result) return structured;
    if (legacyType(row) === "TAG_APPROVAL") {
      return {
        count: Number(row.result.match(/^(\d+)/)?.[1] ?? row.processed),
      };
    }
    if (legacyType(row) === "VIDEO_RETAG") {
      return {
        tagCount: Number(row.result.match(/共 (\d+) 个标签/)?.[1] ?? 0),
      };
    }
    const scan = row.result.match(
      /新增 (\d+)，更新 (\d+)，未变 (\d+)，移除 (\d+)/,
    );
    return scan
      ? {
          added: Number(scan[1]),
          updated: Number(scan[2]),
          skipped: Number(scan[3]),
          removed: Number(scan[4]),
        }
      : {};
  };

  db.transaction(() => {
    const insertJob = db.prepare(`
      INSERT OR IGNORE INTO background_jobs (
        id, kind, payload, status, processed, total, outcome,
        created_at, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertNotification = db.prepare(`
      INSERT OR IGNORE INTO notifications (id, type, payload, is_read, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const row of legacyRows) {
      const type = legacyType(row);
      const payload = legacyPayload(row);
      const outcome = legacyOutcome(row);
      if (row.status !== null) {
        insertJob.run(
          row.id,
          type,
          JSON.stringify(payload),
          row.status,
          row.processed,
          row.total,
          Object.keys(outcome).length > 0 ? JSON.stringify(outcome) : null,
          row.createdAt,
          row.startedAt,
          row.finishedAt,
        );
      }

      if (row.status === null || row.status === "succeeded") {
        insertNotification.run(
          row.id,
          type,
          JSON.stringify({ ...payload, ...outcome }),
          row.isRead,
          row.finishedAt ?? row.createdAt,
        );
      } else if (row.status === "failed") {
        insertNotification.run(
          row.id,
          "ERROR",
          JSON.stringify({ jobKind: type, ...payload }),
          row.isRead,
          row.finishedAt ?? row.createdAt,
        );
      }
    }
    db.exec("DROP TABLE notifications_legacy");
  })();
}

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
// Replace legacy queue indexes after the table split.
db.exec("DROP INDEX IF EXISTS idx_tasks_status");
db.exec("DROP INDEX IF EXISTS idx_tasks_read");
db.exec("DROP INDEX IF EXISTS idx_notifications_status");
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read, id)",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status, id)",
);

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

recordAppVersion(db, process.env.APP_VERSION);

export default db;
