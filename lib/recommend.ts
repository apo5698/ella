import type Database from "better-sqlite3";
import type { VideoCardData } from "@/lib/types";
import { CARD_COLUMNS, CARD_FROM } from "@/lib/videoCardRows";

// The design, with the reasoning behind each weight, is docs/recommendations.md.

const DAY_MS = 86_400_000;
const TASTE_HALF_LIFE_DAYS = 30;
const FRESH_DAYS = 14;
const NEW_SLOT_DAYS = 7;
const REWATCH_AFTER_DAYS = 60;
const IN_PROGRESS_DAYS = 30;
/** Meaningful watches after which the ranking is fully personal. */
const FULLY_PERSONAL_AT = 20;
const MMR_LAMBDA = 0.7;
const POOL_SIZE = 300;

export type WatchEvent = {
  video_id: number;
  started_at: number;
  watched_sec: number;
  max_position: number;
  duration: number | null;
  source: string;
};

/**
 * How much one sitting says the viewer liked the video, from -1 to 1.
 * Watching 60% of it, or ten minutes, is full interest. Leaving within the
 * first seconds counts against it, except after autoplay, which the viewer
 * did not choose.
 */
export function engagement(event: WatchEvent, videoDuration: number | null) {
  if (event.source === "dismiss") return -1;
  const duration = event.duration ?? videoDuration ?? 0;
  const full = duration > 0 ? Math.min(duration * 0.6, 600) : 600;
  const bounce = duration > 0 ? Math.min(20, duration * 0.3) : 20;
  if (event.watched_sec < bounce) return event.source === "autoplay" ? 0 : -0.3;
  return Math.min(1, event.watched_sec / full);
}

/** Matches lib/watchProgress.ts: nearly at the end counts as finished. */
function isFinished(position: number, duration: number | null) {
  if (!duration) return false;
  return position >= duration * 0.97 || duration - position <= 20;
}

/** A stable number in [0, 1) for a video and a seed. */
function seededRandom(id: number, seed: number) {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

type Candidate = VideoCardData & {
  /** Directly assigned tags. */
  tags: Set<number>;
  /** Assigned tags and their ancestors, each with its weight. */
  expanded: Map<number, number>;
  score: number;
  relevance: number;
  novelty: number;
  /** Whether every tag of the video is one the viewer has not disliked. */
  undisliked: boolean;
};

export type Library = {
  videos: VideoCardData[];
  /** Active video_tags rows. */
  videoTags: { video_id: number; tag_id: number }[];
  tagParents: { id: number; parent_id: number | null }[];
  events: WatchEvent[];
};

export type Ranking = {
  /** Candidates by score, best first. Watched and dismissed ones excluded. */
  ranked: Candidate[];
  /** Watches showing real interest, the measure of how much is known. */
  meaningfulWatches: number;
  /** 0 ranks by freshness and chance alone, 1 by taste alone. */
  personal: number;
};

export function loadLibrary(db: Database.Database): Library {
  return {
    videos: db
      .prepare(`SELECT ${CARD_COLUMNS} FROM ${CARD_FROM}`)
      .all() as VideoCardData[],
    videoTags: db
      .prepare(
        "SELECT video_id, tag_id FROM video_tags WHERE status = 'active'",
      )
      .all() as Library["videoTags"],
    tagParents: db
      .prepare("SELECT id, parent_id FROM tags")
      .all() as Library["tagParents"],
    events: db
      .prepare(
        `SELECT video_id, started_at, watched_sec, max_position, duration, source
         FROM watch_events`,
      )
      .all() as WatchEvent[],
  };
}

/** Each tag with its ancestors: the tag 1, its parent 0.5, and so on. */
function ancestry(tagParents: Library["tagParents"]) {
  const parent = new Map(tagParents.map((tag) => [tag.id, tag.parent_id]));
  const cache = new Map<number, Map<number, number>>();
  return (tagId: number) => {
    let result = cache.get(tagId);
    if (result) return result;
    result = new Map();
    let current: number | null | undefined = tagId;
    for (let weight = 1; current != null && !result.has(current); weight /= 2) {
      result.set(current, weight);
      current = parent.get(current);
    }
    cache.set(tagId, result);
    return result;
  };
}

/** Scores every video for this viewer, from the whole watch history. */
export function rank(library: Library, now: number, seed: number): Ranking {
  const lineage = ancestry(library.tagParents);
  const tagsOf = new Map<number, Set<number>>();
  for (const row of library.videoTags) {
    const set = tagsOf.get(row.video_id) ?? new Set();
    set.add(row.tag_id);
    tagsOf.set(row.video_id, set);
  }

  const candidates = library.videos.map((video): Candidate => {
    const tags = tagsOf.get(video.id) ?? new Set<number>();
    const expanded = new Map<number, number>();
    for (const tag of tags)
      for (const [id, weight] of lineage(tag))
        expanded.set(id, Math.max(expanded.get(id) ?? 0, weight));
    return {
      ...video,
      tags,
      expanded,
      score: 0,
      relevance: 0,
      novelty: 1,
      undisliked: true,
    };
  });
  const byId = new Map(candidates.map((video) => [video.id, video]));

  // Taste: every sitting adds its engagement, fading by half each month, to
  // the video's tags and series.
  const tagAffinity = new Map<number, number>();
  const seriesAffinity = new Map<number, number>();
  const history = new Map<
    number,
    { finishedAt: number | null; last: WatchEvent; dismissed: boolean }
  >();
  let meaningfulWatches = 0;
  const events = [...library.events].sort(
    (a, b) => a.started_at - b.started_at,
  );
  for (const event of events) {
    const video = byId.get(event.video_id);
    if (!video) continue;
    const e = engagement(event, video.duration_sec);
    if (e >= 0.5) meaningfulWatches++;
    const age = Math.max(0, now - event.started_at) / DAY_MS;
    const value = e * 0.5 ** (age / TASTE_HALF_LIFE_DAYS);
    for (const [tag, weight] of video.expanded)
      tagAffinity.set(tag, (tagAffinity.get(tag) ?? 0) + value * weight);
    if (video.series_id !== null)
      seriesAffinity.set(
        video.series_id,
        (seriesAffinity.get(video.series_id) ?? 0) + value,
      );

    const seen = history.get(video.id);
    const finished = isFinished(
      event.max_position,
      event.duration ?? video.duration_sec,
    );
    history.set(video.id, {
      finishedAt: finished ? event.started_at : (seen?.finishedAt ?? null),
      last: event,
      dismissed: (seen?.dismissed ?? false) || event.source === "dismiss",
    });
  }

  // A tag on nearly every video says little about any one of them.
  const documents = new Map<number, number>();
  for (const video of candidates)
    for (const tag of video.expanded.keys())
      documents.set(tag, (documents.get(tag) ?? 0) + 1);
  const idf = (tag: number) =>
    Math.log(candidates.length / (documents.get(tag) ?? candidates.length));

  // The episode after the furthest one watched, in each liked series.
  const seriesNext = new Map<number, number>();
  const topSeries = Math.max(0, ...seriesAffinity.values());
  if (topSeries > 0) {
    const episodes = new Map<number, Candidate[]>();
    for (const video of candidates)
      if (video.series_id !== null)
        episodes.set(video.series_id, [
          ...(episodes.get(video.series_id) ?? []),
          video,
        ]);
    for (const [seriesId, affinity] of seriesAffinity) {
      if (affinity <= 0) continue;
      const list = (episodes.get(seriesId) ?? []).sort(
        (a, b) => a.mtime - b.mtime || a.id - b.id,
      );
      const furthest = list.findLastIndex((video) => history.has(video.id));
      const next = list.slice(furthest + 1).find((v) => !history.has(v.id));
      if (next) seriesNext.set(next.id, affinity / topSeries);
    }
  }

  let topRelevance = 0;
  let bottomRelevance = 0;
  for (const video of candidates) {
    let sum = 0;
    for (const [tag, weight] of video.expanded) {
      const affinity = tagAffinity.get(tag) ?? 0;
      sum += weight * affinity * idf(tag);
      if (affinity < 0) video.undisliked = false;
    }
    video.relevance = sum / Math.sqrt(Math.max(1, video.tags.size));
    topRelevance = Math.max(topRelevance, video.relevance);
    bottomRelevance = Math.min(bottomRelevance, video.relevance);
  }

  // One scale for likes and dislikes, so a single early exit does not weigh
  // as much as a month of watching.
  const scale = Math.max(topRelevance, -bottomRelevance);
  const personal = Math.min(1, meaningfulWatches / FULLY_PERSONAL_AT);
  for (const video of candidates) {
    if (scale > 0) video.relevance /= scale;

    const seen = history.get(video.id);
    if (!seen) video.novelty = 1;
    else if (seen.dismissed) video.novelty = 0;
    else if (seen.finishedAt !== null)
      video.novelty =
        now - seen.finishedAt < REWATCH_AFTER_DAYS * DAY_MS ? 0 : 0.3;
    else {
      // Started and left partway: "Continue watching" offers it already.
      const duration = seen.last.duration ?? video.duration_sec ?? 0;
      const started = duration > 0 && seen.last.max_position >= duration * 0.03;
      const recent = now - seen.last.started_at < IN_PROGRESS_DAYS * DAY_MS;
      video.novelty = started && recent ? 0 : 0.3;
    }

    const days = Math.max(0, now - video.mtime) / DAY_MS;
    const freshness = Math.exp(-days / FRESH_DAYS);
    const quality =
      (video.thumbnail ? 0.4 : 0) +
      ((video.height ?? 0) >= 720 ? 0.3 : 0) +
      ((video.duration_sec ?? 0) >= 180 ? 0.3 : 0);
    const taste =
      0.5 * video.relevance +
      0.2 * freshness +
      0.2 * (seriesNext.get(video.id) ?? 0) +
      0.1 * quality;
    const chance = (freshness + quality + seededRandom(video.id, seed)) / 3;
    video.score = video.novelty * (personal * taste + (1 - personal) * chance);
  }

  return {
    ranked: candidates
      .filter((video) => video.novelty > 0 && video.score > 0)
      .sort((a, b) => b.score - a.score || a.id - b.id),
    meaningfulWatches,
    personal,
  };
}

function jaccard(a: Set<number>, b: Set<number>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const tag of a) if (b.has(tag)) shared++;
  return shared / (a.size + b.size - shared);
}

export type PickOptions = {
  count: number;
  /** Already shown elsewhere on the page. */
  exclude?: Set<number>;
  requireThumbnail?: boolean;
  /** Keep one place for a video added in the last week. */
  newSlot?: boolean;
  /** Keep one place for something outside the viewer's usual tags. */
  exploreSlot?: boolean;
  now: number;
  seed: number;
};

/**
 * Picks videos that are both relevant and unlike each other: each next pick
 * trades its score against its likeness to the picks before it. At most one
 * video per series.
 */
export function pick(ranking: Ranking, options: PickOptions): VideoCardData[] {
  const pool = ranking.ranked
    .filter(
      (video) =>
        !options.exclude?.has(video.id) &&
        (!options.requireThumbnail || video.thumbnail),
    )
    .slice(0, POOL_SIZE);
  const top = pool[0]?.score ?? 0;
  const picked: Candidate[] = [];
  const taken = new Set<number>();
  const series = new Set<number>();
  /** Each candidate's greatest likeness to any pick so far. */
  const likeness = new Map<number, number>();
  const open = (video: Candidate) =>
    !taken.has(video.id) &&
    (video.series_id === null || !series.has(video.series_id));
  const take = (video: Candidate | undefined) => {
    if (!video) return;
    picked.push(video);
    taken.add(video.id);
    if (video.series_id !== null) series.add(video.series_id);
    for (const other of pool)
      likeness.set(
        other.id,
        Math.max(likeness.get(other.id) ?? 0, jaccard(other.tags, video.tags)),
      );
  };
  const mostRelevant = () => {
    let best: Candidate | undefined;
    let bestValue = -Infinity;
    for (const video of pool) {
      if (!open(video)) continue;
      const value =
        MMR_LAMBDA * (video.score / top) -
        (1 - MMR_LAMBDA) * (likeness.get(video.id) ?? 0);
      if (value > bestValue) [best, bestValue] = [video, value];
    }
    return best;
  };

  const explore = options.exploreSlot && ranking.personal > 0;
  take(mostRelevant());
  if (options.newSlot) {
    const since = options.now - NEW_SLOT_DAYS * DAY_MS;
    if (!picked.some((video) => video.mtime >= since))
      take(pool.find((video) => open(video) && video.mtime >= since));
  }
  while (picked.length < options.count - (explore ? 1 : 0)) {
    const next = mostRelevant();
    if (!next) break;
    take(next);
  }
  if (explore) {
    // Low relevance but never disliked, chosen by the day's chance.
    const outside = pool.filter(
      (video) =>
        open(video) &&
        video.novelty === 1 &&
        video.undisliked &&
        video.relevance < 0.2,
    );
    take(
      outside.sort(
        (a, b) =>
          seededRandom(b.id, options.seed) - seededRandom(a.id, options.seed),
      )[0] ?? mostRelevant(),
    );
  }

  return picked.slice(0, options.count).map((video) => {
    const card: VideoCardData = {
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      duration_sec: video.duration_sec,
      width: video.width,
      height: video.height,
      views: video.views,
      mtime: video.mtime,
      ext: video.ext,
      series_id: video.series_id,
      series_name: video.series_name,
    };
    return card;
  });
}

export type Recommendations = {
  /** The home page spotlight. */
  featured: VideoCardData[];
  /** The "For you" shelf, empty until the history says enough. */
  forYou: VideoCardData[];
};

/** Meaningful watches before a "For you" shelf is worth showing. */
const FOR_YOU_AFTER = 3;

let cache: { key: string; value: Recommendations } | null = null;

/**
 * Changes whenever a watch is reported or the library changes, and once a
 * day, when the chance in the ranking draws again.
 */
function cacheKey(db: Database.Database, seed: number) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) || ':' || TOTAL(watched_sec)
          FROM watch_events) AS watches,
         (SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) || ':' || IFNULL(MAX(mtime), 0)
            || ':' || COUNT(thumbnail) || ':' || TOTAL(series_id)
          FROM videos) AS videos,
         (SELECT COUNT(*) || ':' || TOTAL(tag_id) FROM video_tags
          WHERE status = 'active') AS tags`,
    )
    .get() as { watches: string; videos: string; tags: string };
  return `${seed}|${row.watches}|${row.videos}|${row.tags}`;
}

/** The spotlight and the "For you" shelf, for the viewer's history. */
export function loadRecommendations(
  db: Database.Database,
  now = Date.now(),
): Recommendations {
  const seed = Math.floor(now / DAY_MS);
  const key = cacheKey(db, seed);
  if (cache?.key === key) return cache.value;

  const ranking = rank(loadLibrary(db), now, seed);
  const featured = pick(ranking, {
    count: 5,
    requireThumbnail: true,
    newSlot: true,
    exploreSlot: true,
    now,
    seed,
  });
  const forYou =
    ranking.meaningfulWatches >= FOR_YOU_AFTER
      ? pick(ranking, {
          count: 18,
          exclude: new Set(featured.map((video) => video.id)),
          exploreSlot: true,
          now,
          seed: seed + 1,
        })
      : [];
  cache = { key, value: { featured, forYou } };
  return cache.value;
}
