import type Database from "better-sqlite3";
import type { VideoCardData } from "@/lib/types";
import { loadRecommendations } from "@/lib/recommend";
import { CARD_COLUMNS, CARD_FROM } from "@/lib/videoCardRows";

function cards(
  db: Database.Database,
  where: string,
  orderBy: string,
  limit: number,
  params: (string | number)[] = [],
) {
  return db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM ${CARD_FROM}
       WHERE ${where} ORDER BY ${orderBy} LIMIT ?`,
    )
    .all(...params, limit) as VideoCardData[];
}

/** A small number that changes once a day, so a "random" pick holds still. */
function daySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

/** Deterministic shuffle: the same seed gives the same order. */
function shuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed % 2147483647 || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export type HomeShelf = {
  /** Stable key; also selects the heading text. */
  kind: "forYou" | "newest" | "popular" | "discover" | "series";
  id: string;
  /** The series name, for series shelves. */
  name?: string;
  /** Where "View all" leads, as a query string for the home page. */
  query?: string;
  videos: VideoCardData[];
};

export type HomeData = {
  featured: VideoCardData[];
  shelves: HomeShelf[];
};

const SHELF_SIZE = 18;

/** Everything the home page shows before the user narrows it. */
export function loadHome(db: Database.Database): HomeData {
  const withThumb = "v.thumbnail IS NOT NULL";
  const seed = daySeed();

  const { featured, forYou } = loadRecommendations(db);

  const newest = cards(db, "1=1", "v.mtime DESC, v.views DESC", SHELF_SIZE);
  const popular = cards(db, "1=1", "v.views DESC, v.mtime DESC", SHELF_SIZE);
  const discover = shuffle(cards(db, withThumb, "v.id", 2000), seed + 7).slice(
    0,
    SHELF_SIZE,
  );

  const series = db
    .prepare(
      `SELECT s.id, s.name, COUNT(*) AS count FROM series s
       JOIN videos v ON v.series_id = s.id
       GROUP BY s.id HAVING count >= 4
       ORDER BY MAX(v.mtime) DESC LIMIT 4`,
    )
    .all() as { id: number; name: string; count: number }[];

  const shelves: HomeShelf[] = [
    { kind: "forYou", id: "for-you", videos: forYou },
    { kind: "newest", id: "newest", query: "sort=newest", videos: newest },
    { kind: "popular", id: "popular", query: "sort=views", videos: popular },
    ...series.map((entry): HomeShelf => ({
      kind: "series",
      id: `series-${entry.id}`,
      name: entry.name,
      query: `series=${entry.id}&sort=newest`,
      videos: cards(db, "v.series_id = ?", "v.mtime DESC", SHELF_SIZE, [
        entry.id,
      ]),
    })),
    { kind: "discover", id: "discover", videos: discover },
  ];
  // The series shelves sit between the two lists everyone scans first and
  // the random one, which is for when nothing above appealed.
  return { featured, shelves: shelves.filter((s) => s.videos.length > 0) };
}

export type RelatedVideos = {
  /** The other videos of the same series, oldest first, as episodes run. */
  series: VideoCardData[];
  /** Videos sharing the most tags, then popular ones to fill the list. */
  related: VideoCardData[];
};

/** What the video page offers to play next. */
export function loadRelated(
  db: Database.Database,
  video: { id: number; series_id: number | null },
  limit = 20,
): RelatedVideos {
  const series =
    video.series_id === null
      ? []
      : cards(db, "v.series_id = ?", "v.mtime ASC, v.id ASC", 100, [
          video.series_id,
        ]);

  const related = db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM ${CARD_FROM}
       JOIN (
         SELECT other.video_id, COUNT(*) AS shared FROM video_tags mine
         JOIN video_tags other ON other.tag_id = mine.tag_id
         WHERE mine.video_id = ? AND mine.status = 'active'
           AND other.status = 'active' AND other.video_id != ?
         GROUP BY other.video_id
       ) m ON m.video_id = v.id
       WHERE v.series_id IS NOT ? OR v.series_id IS NULL
       ORDER BY m.shared DESC, v.views DESC LIMIT ?`,
    )
    .all(video.id, video.id, video.series_id, limit) as VideoCardData[];

  if (related.length < limit) {
    const seen = new Set([video.id, ...related.map((item) => item.id)]);
    for (const item of cards(db, "1=1", "v.views DESC", limit * 2)) {
      if (related.length >= limit) break;
      const sameSeries =
        video.series_id !== null && item.series_id === video.series_id;
      if (!seen.has(item.id) && !sameSeries) related.push(item);
    }
  }
  return { series, related };
}
