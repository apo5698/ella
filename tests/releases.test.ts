import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { compareVersions, getLatestRelease } from "../lib/releases";

afterEach(() => mock.restoreAll());

test("compares SemVer numerically, including prereleases", () => {
  assert.equal(compareVersions("0.1.9", "0.1.10"), -1);
  assert.equal(compareVersions("0.1.0", "v0.1.0"), 0);
  assert.equal(compareVersions("1.0.0", "0.9.9"), 1);
  assert.equal(compareVersions("0.2.0-beta.1", "0.2.0"), -1);
  assert.equal(compareVersions("unknown", "0.1.0"), null);
});

test("reads the latest public release with bounded caching and timeout", async () => {
  mock.method(
    globalThis,
    "fetch",
    async (
      url: string,
      options: RequestInit & { next: { revalidate: number } },
    ) => {
      assert.equal(
        url,
        "https://api.github.com/repos/apo5698/ella/releases/latest",
      );
      assert.equal(options.next.revalidate, 3600);
      assert.ok(options.signal);
      assert.equal(new Headers(options.headers).has("Authorization"), false);
      return Response.json({
        tag_name: "v0.1.0",
        draft: false,
        prerelease: false,
      });
    },
  );
  assert.deepEqual(await getLatestRelease(), {
    status: "available",
    version: "0.1.0",
    url: "https://github.com/apo5698/ella/releases/tag/v0.1.0",
  });
});

for (const [status, expected] of [
  [404, "empty"],
  [401, "unavailable"],
  [403, "unavailable"],
  [429, "unavailable"],
  [500, "unavailable"],
] as const) {
  test(`handles GitHub HTTP ${status}`, async () => {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response(null, { status }),
    );
    assert.deepEqual(await getLatestRelease(), { status: expected });
  });
}

test("handles a timeout or network failure", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("Network unavailable");
  });
  assert.deepEqual(await getLatestRelease(), { status: "unavailable" });
});

for (const release of [
  { tag_name: "latest", draft: false, prerelease: false },
  { tag_name: "v0.2.0", draft: true, prerelease: false },
  { tag_name: "v0.2.0-beta.1", draft: false, prerelease: true },
  {},
]) {
  test(`rejects an invalid or non-public release: ${JSON.stringify(release)}`, async () => {
    mock.method(globalThis, "fetch", async () => Response.json(release));
    assert.deepEqual(await getLatestRelease(), { status: "unavailable" });
  });
}
