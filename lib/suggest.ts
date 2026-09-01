import type Database from "better-sqlite3";
import { normalizeSearchText, pinyinSearchForms } from "@/lib/pinyinSearch";
import type { TagReviewState } from "@/lib/types";

export const SUGGEST_LIMIT = 8;

export type TagSuggestion = {
  id: number;
  name: string;
  count: number;
  reviewState: TagReviewState;
  /** The alias that matched; null when the canonical tag name matched. */
  alias: string | null;
};

type SearchCandidate = {
  id: number;
  name: string;
  count: number;
  text: string;
};

/** Exact, prefix, then substring match across text, full pinyin and initials. */
function searchRank(value: string, query: string): number | null {
  if (!query) return 0;
  let best: number | null = null;
  for (const form of pinyinSearchForms(value)) {
    const rank =
      form === query
        ? 0
        : form.startsWith(query)
          ? 1
          : form.includes(query)
            ? 2
            : null;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

function rankCandidates<T extends SearchCandidate>(
  candidates: T[],
  query: string,
): Array<T & { rank: number }> {
  const normalizedQuery = normalizeSearchText(query);
  return candidates
    .flatMap((candidate) => {
      const rank = searchRank(candidate.text, normalizedQuery);
      return rank === null ? [] : [{ ...candidate, rank }];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        right.count - left.count ||
        left.text.length - right.text.length ||
        left.text.localeCompare(right.text, "zh-Hans"),
    );
}

/**
 * Searches canonical tag names and aliases by text, full pinyin or initials.
 * An alias always returns the canonical tag it represents.
 *
 * `assignableOnly` is for the fields that put a tag on a video: a tag that
 * only groups others would be refused on submit, so it is not offered.
 */
export function suggestTags(
  db: Database.Database,
  q: string,
  limit = SUGGEST_LIMIT,
  assignableOnly = false,
): TagSuggestion[] {
  const rows = db
    .prepare(
      `WITH counts AS (
         SELECT tag_id, COUNT(video_id) AS count
         FROM video_tags
         WHERE status = 'active'
         GROUP BY tag_id
       )
       SELECT t.id, t.name, t.review_state AS reviewState,
              NULL AS alias, t.name AS text,
              COALESCE(c.count, 0) AS count
       FROM tags t LEFT JOIN counts c ON c.tag_id = t.id
       WHERE t.assignable = 1 OR NOT ?
       UNION ALL
       SELECT t.id, t.name, t.review_state AS reviewState,
              a.alias, a.alias AS text,
              COALESCE(c.count, 0) AS count
       FROM tag_aliases a
       JOIN tags t ON t.id = a.tag_id
       LEFT JOIN counts c ON c.tag_id = t.id
       WHERE t.assignable = 1 OR NOT ?`,
    )
    .all(assignableOnly ? 1 : 0, assignableOnly ? 1 : 0) as Array<
    TagSuggestion & { text: string }
  >;

  const candidates = q.trim() ? rows : rows.filter((row) => row.alias === null);
  const seen = new Set<number>();
  const suggestions: TagSuggestion[] = [];
  for (const candidate of rankCandidates(candidates, q)) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    suggestions.push({
      id: candidate.id,
      name: candidate.name,
      count: candidate.count,
      reviewState: candidate.reviewState,
      alias: candidate.alias,
    });
    if (suggestions.length === limit) break;
  }
  return suggestions;
}

/** Searches series names by text, full pinyin or initials. */
export function suggestSeries(
  db: Database.Database,
  q: string,
  limit = SUGGEST_LIMIT,
): { id: number; name: string; count: number }[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.name AS text, COUNT(v.id) AS count
       FROM series s
       LEFT JOIN videos v ON v.series_id = s.id
       GROUP BY s.id`,
    )
    .all() as SearchCandidate[];

  return rankCandidates(rows, q)
    .slice(0, limit)
    .map((series) => ({
      id: series.id,
      name: series.name,
      count: series.count,
    }));
}
