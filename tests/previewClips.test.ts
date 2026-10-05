import { scratch } from "./isolate";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { previewClipArgs } from "../lib/previewClips";
import {
  clipPosition,
  FALLBACK_POINTS,
  previewSegments,
  SEGMENT_SECONDS,
} from "../lib/previewSegments";

test("a long video is cut at its preview points", () => {
  const segments = previewSegments(1000, "0.10,0.50,0.90");
  assert.deepEqual(segments, [
    { start: 100, length: SEGMENT_SECONDS },
    { start: 500, length: SEGMENT_SECONDS },
    { start: 900, length: SEGMENT_SECONDS },
  ]);
});

test("a long video without points uses the fixed ones", () => {
  const segments = previewSegments(1000, null);
  assert.deepEqual(
    segments.map((segment) => segment.start),
    FALLBACK_POINTS.map((point) => point * 1000),
  );
});

test("a segment never runs past the end", () => {
  const [segment] = previewSegments(100, "0.99");
  assert.equal(segment.start + segment.length, 100);
});

test("a short video plays whole, and one of unknown length from the start", () => {
  assert.deepEqual(previewSegments(30, "0.5"), [{ start: 0, length: 30 }]);
  assert.deepEqual(previewSegments(null, null), [
    { start: 0, length: SEGMENT_SECONDS * FALLBACK_POINTS.length },
  ]);
});

test("a moment of the clip maps back to its place in the video", () => {
  const segments = previewSegments(1000, "0.10,0.50");
  assert.equal(clipPosition(segments, 1, 1000), 0.101);
  // One second into the second segment.
  assert.equal(clipPosition(segments, SEGMENT_SECONDS + 1, 1000), 0.501);
});

test(
  "ffmpeg cuts a small clip of the segments",
  { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 && "no ffmpeg" },
  () => {
    const source = path.join(scratch, "source.mp4");
    const made = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=30:duration=60",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-loglevel",
      "error",
      source,
    ]);
    assert.equal(made.status, 0, String(made.stderr));

    const out = path.join(scratch, "clip.mp4");
    const segments = previewSegments(60, "0.20,0.50,0.80");
    const cut = spawnSync("ffmpeg", previewClipArgs(source, out, segments));
    assert.equal(cut.status, 0, String(cut.stderr));

    const probe = spawnSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      out,
    ]);
    const info = JSON.parse(String(probe.stdout)) as {
      streams: { width: number; height: number }[];
      format: { duration: string };
    };
    assert.deepEqual(info.streams[0], { width: 1280, height: 720 });
    assert.ok(
      Math.abs(Number(info.format.duration) - 3 * SEGMENT_SECONDS) < 0.2,
    );
    assert.ok(fs.statSync(out).size < fs.statSync(source).size);
  },
);
