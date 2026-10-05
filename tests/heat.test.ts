import "./isolate";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeCurve,
  previewPoints,
  sceneCurve,
  watchCurve,
  type WatchHeatRow,
} from "../lib/heat";
import { HEAT_BUCKETS, viewThreshold } from "../lib/watchRules";

const DURATION = 1000; // ten seconds a bucket

/** Seconds played per bucket: `seconds` in each bucket from `from` to `to`. */
function played(...ranges: [number, number, number][]) {
  const heat = new Array<number>(HEAT_BUCKETS).fill(0);
  for (const [from, to, seconds] of ranges)
    for (let i = from; i < to; i++) heat[i] += seconds;
  return heat;
}

function row(user: number | null, heat: number[]): WatchHeatRow {
  return { user_id: user, duration: DURATION, heat: encodeCurve(heat) };
}

test("a view needs twenty seconds, or 30% of a short video", () => {
  assert.equal(viewThreshold(1200), 20);
  assert.equal(viewThreshold(30), 9);
  assert.equal(viewThreshold(null), 20);
});

test("scene scores fill every bucket and peak at 1", () => {
  // Keyframes every 50 seconds, with one burst of change at 500 s.
  const scored = Array.from(
    { length: 20 },
    (_, i) => [i * 50, i === 10 ? 0.9 : 0.1] as const,
  );
  const curve = sceneCurve(scored, DURATION)!;
  assert.equal(curve.length, HEAT_BUCKETS);
  assert.equal(Math.max(...curve), 1);
  assert.ok(curve.every((value) => value > 0));
  assert.equal(curve.indexOf(1), 50);
  assert.equal(sceneCurve([], DURATION), null);
});

test("a lone viewer's replays rise above what they watched once", () => {
  const { curve, viewers } = watchCurve([
    row(null, played([0, 100, 10])),
    row(null, played([40, 50, 10])),
  ]);
  assert.equal(viewers, 1);
  assert.equal(curve![45], 1);
  assert.equal(curve![10], 0.5);
});

test("one viewer replaying a part outweighs no other viewer", () => {
  const { curve, viewers } = watchCurve([
    // User 1 plays bucket 20 ten times.
    row(1, played([20, 21, 100])),
    // Users 2 and 3 each play bucket 70 once.
    row(2, played([70, 71, 10])),
    row(3, played([70, 71, 10])),
  ]);
  assert.equal(viewers, 3);
  assert.equal(curve![70], 1);
  assert.equal(curve![20], 0.5);
});

test("passing through a bucket does not count as playing it", () => {
  const { curve } = watchCurve([row(null, played([0, 50, 10], [50, 100, 1]))]);
  assert.equal(curve![75], 0);
});

test("preview points take the peaks, apart from each other", () => {
  const curve = new Array<number>(HEAT_BUCKETS).fill(0.1);
  for (const peak of [30, 31, 32, 60, 90]) curve[peak] = 1;
  const points = previewPoints(curve)!;
  assert.equal(points.length, 5);
  for (let i = 1; i < points.length; i++)
    assert.ok(Math.round((points[i] - points[i - 1]) * 100) >= 10);
  assert.ok(points.some((point) => point >= 0.3 && point <= 0.32));
  assert.ok(points.includes(0.6));
  assert.equal(previewPoints(new Array(HEAT_BUCKETS).fill(1)), null);
});

test("watch reports add one view, merge heat and move the preview", async () => {
  const { default: db } = await import("../lib/db");
  const { recordWatch } = await import("../lib/watchEvents");
  const { loadHeat, saveSceneScores } = await import("../lib/heat");
  db.prepare(
    `INSERT INTO videos (id, path, filename, title, ext, size_bytes, mtime,
       created_at, duration_sec)
     VALUES (1, '/v/1.mp4', '1.mp4', 'Video 1', '.mp4', 0, 0, 0, ?)`,
  ).run(DURATION);
  const views = () =>
    (
      db.prepare("SELECT views FROM videos WHERE id = 1").get() as {
        views: number;
      }
    ).views;
  const points = () =>
    (
      db.prepare("SELECT preview_points FROM videos WHERE id = 1").get() as {
        preview_points: string | null;
      }
    ).preview_points;

  const report = {
    session: "sitting-one",
    source: "click" as const,
    watched: 10,
    position: 10,
    duration: DURATION,
    heat: played([0, 1, 10]),
  };
  assert.deepEqual(recordWatch(db, 1, report), { found: true, views: null });
  assert.equal(views(), 0);
  assert.deepEqual(
    recordWatch(db, 1, { ...report, watched: 25, heat: played([0, 3, 10]) }),
    { found: true, views: 1 },
  );
  // A late report with smaller totals neither counts again nor shrinks heat.
  assert.deepEqual(recordWatch(db, 1, { ...report, watched: 400 }), {
    found: true,
    views: null,
  });
  assert.equal(views(), 1);
  assert.deepEqual(loadHeat(db, 1).watch?.slice(0, 4), [1, 1, 1, 0]);

  // One viewer is not enough to steer previews; the scene curve does.
  saveSceneScores(
    db,
    1,
    [
      [0, 0.1],
      [500, 0.9],
      [999, 0.1],
    ],
    DURATION,
    "keyframes",
  );
  assert.ok(points()?.split(",").includes("0.50"));
  assert.ok(loadHeat(db, 1).scene);

  // A curve from keyframes never replaces one from every frame.
  saveSceneScores(
    db,
    1,
    [
      [0, 0.1],
      [200, 0.9],
      [999, 0.1],
    ],
    DURATION,
    "frames",
  );
  saveSceneScores(
    db,
    1,
    [
      [0, 0.1],
      [800, 0.9],
      [999, 0.1],
    ],
    DURATION,
    "keyframes",
  );
  assert.ok(Math.abs(loadHeat(db, 1).scene!.indexOf(1) - 20) <= 1);
});
