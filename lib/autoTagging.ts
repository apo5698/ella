import type Database from "better-sqlite3";
import { normalizeName } from "./names";
import {
  isAssignableTag,
  normalizeTagName,
  resolveTagName,
} from "./tagHierarchy";
import { normalizeSeriesName, type SeriesRecord } from "./series";

export const AUTO_TAG_STRATEGIES = [
  "filename-prefix",
  "filename-manual-tag",
  "filename-regex",
] as const;

export type AutoTagStrategy = (typeof AUTO_TAG_STRATEGIES)[number];

/** What accepting a suggestion writes: a tag on the video, or its series. */
export type AutoTagKind = "tag" | "series";

/**
 * A filename prefix names the work a video belongs to, which is a series
 * rather than a content tag. The other strategies read content, so they stay
 * on tags.
 */
const STRATEGY_KIND: Record<AutoTagStrategy, AutoTagKind> = {
  "filename-prefix": "series",
  "filename-manual-tag": "tag",
  "filename-regex": "tag",
};

export function autoTagKind(strategy: AutoTagStrategy): AutoTagKind {
  return STRATEGY_KIND[strategy];
}

export type AutoTagVideo = {
  id: number;
  filename: string;
  title: string;
  thumbnail: string | null;
  seriesId: number | null;
};

export type AutoTagSuggestion = {
  videoId: number;
  videoTitle: string;
  filename: string;
  thumbnail: string | null;
  kind: AutoTagKind;
  name: string;
  strategy: AutoTagStrategy;
  regexPattern?: string;
};

export const DEFAULT_AUTO_TAG_STRATEGIES = [
  "filename-prefix",
  "filename-manual-tag",
] as const satisfies readonly AutoTagStrategy[];

const VIDEO_COLUMNS = "id, filename, title, thumbnail, series_id AS seriesId";

/** Every video in scan order, with the fields the strategies read. */
export function loadAutoTagVideos(db: Database.Database): AutoTagVideo[] {
  return db
    .prepare(`SELECT ${VIDEO_COLUMNS} FROM videos ORDER BY id`)
    .all() as AutoTagVideo[];
}

export function loadAutoTagVideo(
  db: Database.Database,
  videoId: number,
): AutoTagVideo | undefined {
  return db
    .prepare(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE id = ?`)
    .get(videoId) as AutoTagVideo | undefined;
}

export function autoTagSuggestionKey(suggestion: AutoTagSuggestion) {
  return [
    suggestion.videoId,
    suggestion.strategy,
    suggestion.regexPattern ?? "",
    suggestion.kind,
    suggestion.name,
  ].join(":");
}

export function isAutoTagStrategy(value: unknown): value is AutoTagStrategy {
  return AUTO_TAG_STRATEGIES.includes(value as AutoTagStrategy);
}

export function parseAutoTagStrategies(value: unknown): AutoTagStrategy[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAutoTagStrategy))];
}

/**
 * The bracket pairs a filename may wrap its series name in. Both spellings of
 * each shape are accepted: the same series arrives from different sources
 * written `【x】` or `[x]`, and the brackets are packaging rather than part of
 * the name.
 */
const SERIES_BRACKETS = [
  ["【", "】"],
  ["（", "）"],
  ["[", "]"],
  ["(", ")"],
] as const;

/**
 * Extracts `xxx` from a filename that opens with a bracketed name, in any of
 * the accepted pairs. Only the opening bracket is anchored: what follows the
 * closing one is the title, and further brackets in it are description rather
 * than the series.
 */
export function seriesFromFilenamePrefix(filename: string): string | null {
  const trimmed = filename.trimStart();
  for (const [open, close] of SERIES_BRACKETS) {
    if (!trimmed.startsWith(open)) continue;
    const end = trimmed.indexOf(close, open.length);
    // An unclosed or empty bracket names nothing.
    if (end <= open.length) return null;
    const inside = trimmed.slice(open.length, end);
    // A comma-separated value inside brackets is a tag list, not a series name.
    if (/[,，]/.test(inside)) return null;
    return normalizeSeriesName(inside);
  }
  return null;
}

export function createFilenameTagRegex(pattern: string): RegExp {
  const source = pattern.trim();
  if (!source) throw new Error("请输入正则表达式");

  try {
    return new RegExp(source, "u");
  } catch {
    throw new Error("正则表达式无效");
  }
}

export function tagFromFilenameRegex(
  filename: string,
  regex: RegExp,
): string | null {
  regex.lastIndex = 0;
  const match = regex.exec(filename);
  return match?.[1] ? normalizeTagName(match[1]) : null;
}

/**
 * Builds a read-only suggestion function for one scan. The prepared lookups are
 * shared across every video, while each candidate is resolved through the
 * same canonical-name/alias rules as manual tagging.
 */
export function createAutoTagSuggester(
  db: Database.Database,
  strategies: readonly AutoTagStrategy[],
  regexPattern?: string,
) {
  const findLink = db.prepare(
    "SELECT status FROM video_tags WHERE video_id = ? AND tag_id = ?",
  );
  const findTagIgnoringCase = db.prepare(
    "SELECT id, name FROM tags WHERE lower(name) = ? ORDER BY id LIMIT 1",
  );
  const findSeries = db.prepare("SELECT id, name FROM series WHERE name = ?");
  const findTagWithName = db.prepare(
    `SELECT 1 FROM tags WHERE name = ?
     UNION ALL
     SELECT 1 FROM tag_aliases WHERE alias = ?`,
  );
  const manualTags = strategies.includes("filename-manual-tag")
    ? (db
        .prepare(
          `SELECT DISTINCT t.id, t.name
           FROM tags t
           JOIN video_tags vt ON vt.tag_id = t.id
           WHERE vt.source = 'manual' AND vt.status = 'active'
             AND t.assignable = 1
           ORDER BY length(t.name) DESC, t.name`,
        )
        .all() as { id: number; name: string }[])
    : [];
  const filenameRegex = strategies.includes("filename-regex")
    ? createFilenameTagRegex(regexPattern ?? "")
    : null;

  return (video: AutoTagVideo): AutoTagSuggestion[] => {
    const suggestions: AutoTagSuggestion[] = [];
    const suggested = new Set<string>();

    const addSuggestion = (
      name: string,
      strategy: AutoTagStrategy,
      alreadyHandled: boolean,
    ) => {
      const kind = autoTagKind(strategy);
      const key = `${kind}:${normalizeName(name)}`;
      if (suggested.has(key) || alreadyHandled) return;

      suggested.add(key);
      suggestions.push({
        videoId: video.id,
        videoTitle: video.title,
        filename: video.filename,
        thumbnail: video.thumbnail,
        kind,
        name,
        strategy,
        regexPattern: strategy === "filename-regex" ? regexPattern : undefined,
      });
    };

    const addTagSuggestion = (
      tag: { id: number | null; name: string },
      strategy: AutoTagStrategy,
    ) => {
      if (tag.id !== null && !isAssignableTag(db, tag.id)) return;
      addSuggestion(
        tag.name,
        strategy,
        tag.id !== null && Boolean(findLink.get(video.id, tag.id)),
      );
    };

    if (strategies.includes("filename-prefix")) {
      const prefix = seriesFromFilenamePrefix(video.filename);
      // Tags and series share one namespace, so a prefix already spelled as a
      // tag or an alias cannot be created as a series.
      if (prefix && !findTagWithName.get(prefix, prefix)) {
        const existing = findSeries.get(prefix) as SeriesRecord | undefined;
        // A video holds at most one series: an assigned one is left alone
        // rather than replaced.
        addSuggestion(
          existing?.name ?? prefix,
          "filename-prefix",
          video.seriesId !== null,
        );
      }
    }

    if (strategies.includes("filename-manual-tag")) {
      const filename = video.filename.toLowerCase();
      for (const tag of manualTags) {
        if (filename.includes(tag.name.toLowerCase())) {
          addTagSuggestion(tag, "filename-manual-tag");
        }
      }
    }

    if (filenameRegex) {
      const tagName = tagFromFilenameRegex(video.filename, filenameRegex);
      if (tagName) {
        const resolved = resolveTagName(db, tagName);
        const existing =
          resolved.id === null
            ? (findTagIgnoringCase.get(tagName) as
                { id: number; name: string } | undefined)
            : undefined;
        addTagSuggestion(existing ?? resolved, "filename-regex");
      }
    }

    return suggestions;
  };
}

/** Runs the normal suggestion pipeline for one video without scanning the library. */
export function suggestAutoTagsForVideo(
  db: Database.Database,
  videoId: number,
  strategies: readonly AutoTagStrategy[] = DEFAULT_AUTO_TAG_STRATEGIES,
  regexPattern?: string,
) {
  const video = loadAutoTagVideo(db, videoId);
  return video
    ? createAutoTagSuggester(db, strategies, regexPattern)(video)
    : [];
}
