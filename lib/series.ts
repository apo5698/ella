import type Database from "better-sqlite3";
import { compareNames } from "./tagOrder";
import { normalizeName } from "./names";

export type SeriesRecord = { id: number; name: string };

/**
 * Series names follow the same spelling rule as tags: lowercase, with spaces
 * closed up into hyphens. Every write path runs a name through this, so
 * `Cocoa Soft` and `cocoa-soft` cannot end up as two series.
 */
export function normalizeSeriesName(raw: string): string {
  return normalizeName(raw);
}

/** Resolves a series name, creating the record once when it is new. */
export function ensureSeries(
  db: Database.Database,
  rawName: string,
): SeriesRecord {
  const name = normalizeSeriesName(rawName);
  if (!name) throw new Error("系列名称不能为空。");

  const existing = db
    .prepare("SELECT id, name FROM series WHERE name = ?")
    .get(name) as SeriesRecord | undefined;
  if (existing) return existing;

  const info = db.prepare("INSERT INTO series (name) VALUES (?)").run(name);
  return { id: Number(info.lastInsertRowid), name };
}

/** One series as the management page sees it. */
export type SeriesSummary = { id: number; name: string; videoCount: number };

/**
 * Every series with the number of videos in it. Ordered here rather than in
 * SQL: SQLite compares Chinese text by code point, which reads as unsorted.
 */
export function loadSeries(db: Database.Database): SeriesSummary[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, COUNT(v.id) AS videoCount
       FROM series s
       LEFT JOIN videos v ON v.series_id = s.id
       GROUP BY s.id`,
    )
    .all() as SeriesSummary[];
  return rows.sort((a, b) => compareNames(a.name, b.name));
}
