import "./isolate";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { inferenceScale, recordInference } from "../lib/inferenceTiming";
import { createTracker, inferEstimateSec } from "../lib/progress";
import { saveLlmSettings } from "../lib/settingsStore";

function inferring(frames: number, scale = 1) {
  mock.timers.enable({ apis: ["Date"], now: 0 });
  const tracker = createTracker(60, "fixed", scale);
  tracker.update({ phase: "extract", ratio: 1 });
  tracker.update({ phase: "infer", ratio: 1, frames });
  return tracker;
}

test("inference reports the wait and stops counting down once overdue", (t) => {
  t.after(() => mock.timers.reset());
  const tracker = inferring(4);
  const estimate = inferEstimateSec(4);

  mock.timers.tick(3000);
  const early = tracker.snapshot();
  assert.equal(early.inferElapsedSec, 3);
  assert.notEqual(early.etaSec, null);

  mock.timers.tick(Math.ceil(estimate) * 1000);
  const late = tracker.snapshot();
  assert.equal(late.etaSec, null);
  assert.ok(late.ratio <= 0.99);
  assert.ok(late.inferElapsedSec! > estimate);
});

test("a slower model stretches the estimate", (t) => {
  t.after(() => mock.timers.reset());
  const tracker = inferring(4, 3);
  mock.timers.tick(Math.ceil(inferEstimateSec(4)) * 1000);
  assert.notEqual(tracker.snapshot().etaSec, null);
});

test("measured inference times move the scale, per model", () => {
  saveLlmSettings({ model: "model-a" });
  assert.equal(inferenceScale(), 1);

  recordInference(4, inferEstimateSec(4) * 2);
  assert.equal(inferenceScale(), 2);

  recordInference(4, inferEstimateSec(4));
  assert.ok(Math.abs(inferenceScale() - 1.7) < 1e-9);

  saveLlmSettings({ model: "model-b" });
  assert.equal(inferenceScale(), 1);
});
