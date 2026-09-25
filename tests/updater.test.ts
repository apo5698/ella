import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import english from "../messages/en.json";

// Route handlers read translations from the Next request, which a plain Node
// test does not have. The messages themselves are the real English ones.
mock.module("next-intl/server", {
  namedExports: {
    getTranslations: async (namespace: keyof typeof english) => (key: string) =>
      (english[namespace] as Record<string, string>)[key],
  },
});

test("the update API uses the local service and only installs a newer release", async () => {
  const { GET, POST } = await import("../app/api/system/update/route");
  const directory = mkdtempSync(join(tmpdir(), "ella-updater-test-"));
  const socket = join(directory, "control.sock");
  const oldSocket = process.env.ELLA_UPDATER_SOCKET;
  const oldVersion = process.env.APP_VERSION;
  process.env.ELLA_UPDATER_SOCKET = socket;
  process.env.APP_VERSION = "0.1.0";
  const requests: unknown[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.method === "POST") requests.push(JSON.parse(body));
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          state: request.method === "POST" ? "pulling" : "idle",
          version: request.method === "POST" ? "0.2.0" : null,
          message: "",
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  try {
    mock.method(
      globalThis,
      "fetch",
      async (_url: string, options: RequestInit) => {
        assert.equal(options.cache, "no-store");
        return Response.json({
          tag_name: "v0.2.0",
          draft: false,
          prerelease: false,
        });
      },
    );
    const status = await (await GET()).json();
    assert.equal(status.available, true);
    assert.equal(status.currentVersion, "0.1.0");
    const makeRequest = (origin = "http://localhost") =>
      new Request("http://localhost/api/system/update", {
        method: "POST",
        headers: { origin, host: "localhost" },
        body: JSON.stringify({ version: "9.9.9", command: "ignored" }),
      });
    assert.equal(
      (await POST(makeRequest("https://other.example"))).status,
      403,
    );
    assert.equal((await POST(makeRequest("invalid"))).status, 403);
    assert.equal(requests.length, 0);
    assert.equal((await POST(makeRequest())).status, 202);
    assert.deepEqual(requests, [{ version: "0.2.0" }]);
    process.env.APP_VERSION = "0.2.0";
    assert.equal((await POST(makeRequest())).status, 409);
    process.env.APP_VERSION = "0.3.0";
    assert.equal((await POST(makeRequest())).status, 409);
    assert.equal(requests.length, 1);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.equal((await (await GET()).json()).available, false);
    process.env.APP_VERSION = "0.1.0";
    assert.equal((await POST(makeRequest())).status, 503);
  } finally {
    server.close();
    mock.restoreAll();
    if (oldSocket === undefined) delete process.env.ELLA_UPDATER_SOCKET;
    else process.env.ELLA_UPDATER_SOCKET = oldSocket;
    if (oldVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = oldVersion;
    rmSync(directory, { recursive: true, force: true });
  }
});
