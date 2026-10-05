import "./isolate";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  engagement,
  pick,
  rank,
  type Library,
  type WatchEvent,
} from "../lib/recommend";
import type { VideoCardData } from "../lib/types";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function video(id: number, extra: Partial<VideoCardData> = {}): VideoCardData {
  return {
    id,
    title: `Video ${id}`,
    thumbnail: `${id}.jpg`,
    duration_sec: 1200,
    width: 1920,
    height: 1080,
    views: 0,
    mtime: NOW - 100 * DAY,
    ext: ".mp4",
    series_id: null,
    series_name: null,
    preview_points: null,
    preview_clip: null,
    ...extra,
  };
}

function watch(
  videoId: number,
  watched: number,
  extra: Partial<WatchEvent> = {},
): WatchEvent {
  return {
    video_id: videoId,
    started_at: NOW - DAY,
    watched_sec: watched,
    max_position: watched,
    duration: 1200,
    source: "click",
    ...extra,
  };
}

/** Videos 1-6 carry tag 10, videos 7-12 tag 20; 30 is the parent of both. */
function library(events: WatchEvent[], videos?: VideoCardData[]): Library {
  const list = videos ?? Array.from({ length: 12 }, (_, i) => video(i + 1));
  return {
    videos: list,
    videoTags: list.map((v) => ({
      video_id: v.id,
      tag_id: v.id <= 6 ? 10 : 20,
    })),
    tagParents: [
      { id: 10, parent_id: 30 },
      { id: 20, parent_id: 30 },
      { id: 30, parent_id: null },
    ],
    events,
  };
}

test("engagement rewards long watches and penalizes early exits", () => {
  assert.equal(engagement(watch(1, 720), 1200), 1);
  assert.equal(engagement(watch(1, 300), 1200), 0.5);
  assert.equal(engagement(watch(1, 5), 1200), -0.3);
  assert.equal(engagement(watch(1, 5, { source: "autoplay" }), 1200), 0);
  assert.equal(engagement(watch(1, 0, { source: "dismiss" }), 1200), -1);
  // Ten minutes is full interest however long the video is.
  assert.equal(engagement(watch(1, 600, { duration: 7200 }), 7200), 1);
});

test("videos sharing liked tags rank first, and watched ones drop out", () => {
  const events = Array.from({ length: 20 }, (_, i) => watch(1 + (i % 3), 1200));
  const ranking = rank(library(events), NOW, 1);
  const ids = ranking.ranked.map((v) => v.id);
  assert.ok(!ids.includes(1) && !ids.includes(2) && !ids.includes(3));
  assert.deepEqual(ids.slice(0, 3).sort(), [4, 5, 6]);
});

test("videos with a disliked tag sink below the liked ones", () => {
  const events = [
    ...[1, 2, 3].map((id) => watch(id, 5)),
    // Enough interest elsewhere for taste to count, long enough ago that
    // video 7 itself may come back.
    ...Array.from({ length: 20 }, (_, i) =>
      watch(7, 1200, { started_at: NOW - (70 + i) * DAY }),
    ),
  ];
  const ids = rank(library(events), NOW, 1).ranked.map((v) => v.id);
  const lowestLiked = Math.max(
    ...[8, 9, 10, 11, 12].map((id) => ids.indexOf(id)),
  );
  // Below every liked video, or out of the ranking altogether.
  for (const id of [4, 5, 6])
    assert.ok(ids.indexOf(id) === -1 || ids.indexOf(id) > lowestLiked);
  assert.ok(lowestLiked >= 0);
});

test("the next episode of a watched series is preferred", () => {
  const videos = [
    ...Array.from({ length: 12 }, (_, i) => video(i + 1)),
    ...[13, 14, 15].map((id) =>
      video(id, { series_id: 1, mtime: NOW - (200 - id) * DAY }),
    ),
  ];
  const events = Array.from({ length: 20 }, (_, i) =>
    watch(13, 1200, { started_at: NOW - i * DAY }),
  );
  const ranking = rank(library(events, videos), NOW, 1);
  assert.equal(ranking.ranked[0].id, 14);
  assert.ok(!ranking.ranked.some((v) => v.id === 13));
});

test("a video left partway is not recommended again soon", () => {
  const ranking = rank(library([watch(4, 300)]), NOW, 1);
  assert.ok(!ranking.ranked.some((v) => v.id === 4));
});

test("picks vary by tag, keep one video per series and hold a new one", () => {
  const videos = [
    ...Array.from({ length: 12 }, (_, i) =>
      video(i + 1, { series_id: i < 4 ? 1 : null }),
    ),
    video(99, { mtime: NOW - 2 * DAY }),
  ];
  const events = Array.from({ length: 20 }, (_, i) =>
    watch(5, 1200, { started_at: NOW - (70 + i) * DAY }),
  );
  const ranking = rank(library(events, videos), NOW, 1);
  const picks = pick(ranking, {
    count: 5,
    newSlot: true,
    exploreSlot: true,
    now: NOW,
    seed: 1,
  });
  assert.equal(picks.length, 5);
  assert.ok(picks.filter((v) => v.series_id === 1).length <= 1);
  assert.ok(picks.some((v) => v.id === 99));
  assert.ok(picks.some((v) => v.id >= 7 && v.id <= 12));
});

test("with no history the ranking rests on freshness and chance", () => {
  const ranking = rank(library([]), NOW, 1);
  assert.equal(ranking.personal, 0);
  assert.equal(ranking.ranked.length, 12);
  const other = rank(library([]), NOW, 2);
  assert.notDeepEqual(
    ranking.ranked.map((v) => v.id),
    other.ranked.map((v) => v.id),
  );
});

test("watch reports update one row per session and feed recommendations", async () => {
  const { default: db } = await import("../lib/db");
  const { recordWatch } = await import("../lib/watchEvents");
  const { loadRecommendations } = await import("../lib/recommend");
  const insert = db.prepare(
    `INSERT INTO videos (path, filename, title, ext, size_bytes, mtime,
       created_at, thumbnail, duration_sec, height)
     VALUES (?, ?, ?, '.mp4', 0, ?, 0, 'x.jpg', 1200, 1080)`,
  );
  for (let i = 1; i <= 30; i++)
    insert.run(`/v/${i}.mp4`, `${i}.mp4`, `Video ${i}`, NOW - i * DAY);

  const report = {
    session: "session-one",
    source: "click" as const,
    watched: 100,
    position: 100,
    duration: 1200,
  };
  assert.deepEqual(recordWatch(db, 1, report, NOW), { found: true, views: 1 });
  assert.deepEqual(recordWatch(db, 1, { ...report, watched: 50 }, NOW), {
    found: true,
    views: null,
  });
  assert.deepEqual(recordWatch(db, 1, { ...report, watched: 900 }, NOW), {
    found: true,
    views: null,
  });
  const rows = db.prepare("SELECT watched_sec FROM watch_events").all() as {
    watched_sec: number;
  }[];
  assert.deepEqual(rows, [{ watched_sec: 900 }]);
  assert.deepEqual(recordWatch(db, 2, report, NOW), { found: false });
  assert.deepEqual(recordWatch(db, 404, { ...report, session: "gone-1" }), {
    found: false,
  });

  const before = loadRecommendations(db, NOW);
  assert.equal(before.featured.length, 5);
  assert.ok(!before.featured.some((v) => v.id === 1));
  assert.deepEqual(before.forYou, []);

  for (const id of [2, 3])
    recordWatch(
      db,
      id,
      { ...report, session: `session-${id}`, watched: 900 },
      NOW,
    );
  const after = loadRecommendations(db, NOW);
  assert.ok(!after.featured.some((v) => [1, 2, 3].includes(v.id)));
  assert.ok(after.forYou.length > 0);
});
