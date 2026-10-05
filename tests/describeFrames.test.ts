import "./isolate";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AppError } from "../lib/appError";
import { describeFrames } from "../lib/vision";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function failWith(error: unknown) {
  globalThis.fetch = (() => Promise.reject(error)) as typeof fetch;
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : "other";
  }
  return "none";
}

test("a reply that never comes fails as a timeout", async () => {
  failWith(
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("Headers Timeout"), {
        code: "UND_ERR_HEADERS_TIMEOUT",
      }),
    }),
  );
  assert.equal(await codeOf(describeFrames(["x"], "prompt")), "modelTimeout");
});

test("a server that cannot be reached fails as unavailable", async () => {
  failWith(new TypeError("fetch failed"));
  assert.equal(
    await codeOf(describeFrames(["x"], "prompt")),
    "modelUnavailable",
  );
});

test("a stop by the user stays a stop", async () => {
  const controller = new AbortController();
  controller.abort();
  failWith(new DOMException("aborted", "AbortError"));
  assert.equal(
    await codeOf(describeFrames(["x"], "prompt", controller.signal)),
    "other",
  );
});
