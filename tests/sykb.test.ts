import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { path7za } from "7zip-bin";
import { sykbDownloadSchema } from "../lib/utilities/sykbSchema";
import { extractSykbVideo } from "../lib/utilities/sykbArchive";
import { parseBaiduTransfer } from "../lib/utilities/baiduProgress";

const input = {
  url: "https://pan.baidu.com/s/1Example",
  code: "aB09",
  name: "Example video",
};
test("SYKB validates share origin, four-character code and required name", () => {
  assert.ok(sykbDownloadSchema.safeParse(input).success);
  assert.ok(
    sykbDownloadSchema.safeParse({ ...input, url: input.url + "?pwd=zz99" })
      .success,
  );
  for (const url of [
    "http://pan.baidu.com/s/1Example",
    "https://pan.baidu.com.evil.test/s/1Example",
    "https://pan.baidu.com/s/",
    "https://pan.baidu.com@evil.test/s/1Example",
    "https://pan.baidu.com/s/../other",
    "https://pan.baidu.com/s/%2f",
  ]) {
    assert.equal(
      sykbDownloadSchema.safeParse({ ...input, url }).success,
      false,
      url,
    );
  }
  for (const code of ["", "123", "12345", "a-12", "中文12"])
    assert.equal(
      sykbDownloadSchema.safeParse({ ...input, code }).success,
      false,
    );
  assert.equal(
    sykbDownloadSchema.safeParse({ ...input, name: "  " }).success,
    false,
  );
});

test("BaiduPCS-Go progress yields only the latest transfer sizes", () => {
  assert.equal(parseBaiduTransfer("正在转存..."), null);
  assert.deepEqual(
    parseBaiduTransfer(
      "\r[1] ↓ 512B/2.00KB 512B/s in 1s, left 3s ............" +
        "\r[1] ↓ 1.50MB/10.00GB 1.00MB/s in 2s, left 2h ............",
    ),
    { received: 1.5 * 1024 ** 2, total: 10 * 1024 ** 3 },
  );
  assert.deepEqual(parseBaiduTransfer("[1] ↓ 0B/0B 0B/s in 0s, left - ..."), {
    received: 0,
    total: null,
  });
});

test("archive extraction and downloader integration use isolated fixtures", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "ella-sykb-test-"));
  const originalEnv = { ...process.env };
  let db: { close(): void } | undefined;
  try {
    await chmod(path7za, 0o755);
    const fixture = path.join(root, "fixture");
    await mkdir(fixture);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=3",
      "-c:v",
      "mpeg4",
      path.join(fixture, "123.mp4"),
    ]);
    const pack = (name: string, files: string[], password?: string) => {
      const target = path.join(fixture, name);
      execFileSync(
        path7za,
        ["a", ...(password ? [`-p${password}`] : []), target, ...files],
        { cwd: fixture, stdio: "pipe" },
      );
      return target;
    };
    const innerZip = pack("inner.zip", ["123.mp4"]);
    pack("inner.7z", ["123.mp4"]);
    for (const outer of ["zip", "7z"])
      for (const inner of ["zip", "7z"]) {
        const archive = pack(`outer-${outer}-${inner}.${outer}`, [
          `inner.${inner}`,
        ]);
        await t.test(`${outer} -> ${inner} -> MP4`, async () => {
          const work = await mkdtemp(path.join(root, "extract-"));
          const layers: number[] = [];
          const video = await extractSykbVideo(archive, work, (layer) => {
            if (layers.at(-1) !== layer) layers.push(layer);
          });
          assert.deepEqual(
            await readFile(video),
            await readFile(path.join(fixture, "123.mp4")),
          );
          assert.deepEqual(layers, [1, 2]);
        });
      }
    await writeFile(path.join(fixture, "extra.txt"), "extra");
    const badArchives = [
      pack("single.zip", ["123.mp4"]),
      pack("extra.zip", ["inner.zip", "extra.txt"]),
      pack("no-video.zip", ["extra.txt"]),
      pack("third.zip", ["outer-zip-zip.zip"]),
      pack("encrypted.zip", ["inner.zip"], "secret"),
    ];
    execFileSync("python3", [
      "-c",
      "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1], 'w'); z.writestr('../escape.zip', b'bad'); z.close()",
      path.join(fixture, "traversal.zip"),
    ]);
    badArchives.push(path.join(fixture, "traversal.zip"));
    badArchives.push(pack("inner-no-mp4.zip", ["no-video.zip"]));
    await writeFile(
      path.join(fixture, "456.mp4"),
      await readFile(path.join(fixture, "123.mp4")),
    );
    pack("two-videos.zip", ["123.mp4", "456.mp4"]);
    badArchives.push(pack("inner-two-mp4.zip", ["two-videos.zip"]));
    execFileSync("python3", [
      "-c",
      "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1], 'w'); i=zipfile.ZipInfo('link.zip'); i.create_system=3; i.external_attr=0o120777<<16; z.writestr(i, '../escape.zip'); z.close()",
      path.join(fixture, "symlink.zip"),
    ]);
    badArchives.push(path.join(fixture, "symlink.zip"));
    const truncated = path.join(fixture, "truncated.zip");
    await writeFile(truncated, (await readFile(innerZip)).subarray(0, 40));
    badArchives.push(truncated);
    for (const archive of badArchives)
      await t.test(`reject ${path.basename(archive)}`, async () => {
        const work = await mkdtemp(path.join(root, "reject-"));
        await assert.rejects(extractSykbVideo(archive, work, () => {}));
      });

    process.env.DB_PATH = path.join(root, "catalog.db");
    process.env.VIDEO_ROOT = path.join(root, "videos");
    process.env.THUMB_DIR = path.join(root, "thumbs");
    process.env.BAIDUPCS_GO_CONFIG_DIR = path.join(root, "account");
    process.env.BAIDUPCS_GO_PATH = path.join(root, "fake-pcs");
    process.env.SYKB_TEST_ARCHIVE = path.join(fixture, "outer-zip-7z.zip");
    process.env.SYKB_TEST_TRACE = path.join(root, "trace.jsonl");
    await mkdir(process.env.BAIDUPCS_GO_CONFIG_DIR);
    const configFile = path.join(
      process.env.BAIDUPCS_GO_CONFIG_DIR,
      "pcs_config.json",
    );
    const config = JSON.stringify({
      baidu_active_uid: 1,
      baidu_user_list: [{ uid: 1, bduss: "fixture-only", workdir: "/" }],
    });
    await writeFile(configFile, config);
    await writeFile(
      process.env.BAIDUPCS_GO_PATH,
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(process.env.BAIDUPCS_GO_CONFIG_DIR, 'pcs_config.json');
const config = JSON.parse(fs.readFileSync(file));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SYKB_TEST_TRACE, JSON.stringify({ args, directory: process.env.BAIDUPCS_GO_CONFIG_DIR }) + '\\n');
if (args[0] === 'config') config.savedir = args[3];
if (args[0] === 'cd') config.baidu_user_list[0].workdir = args[1];
fs.writeFileSync(file, JSON.stringify(config));
if (args[0] === 'transfer') {
  if (process.env.SYKB_TEST_FAIL) { console.log('转存失败: fixture failure'); process.exit(0); }
  if (process.env.SYKB_TEST_HANG) { setTimeout(() => {}, 60000); return; }
  process.stdout.write('\\r[1] ↓ 1.50KB/3.00KB 1.00KB/s in 1s, left 1s ............');
  fs.copyFileSync(process.env.SYKB_TEST_ARCHIVE, path.join(config.savedir, '123.zip'));
  console.log('下载结束');
}
`,
      { mode: 0o700 },
    );
    const { downloadSykb } = await import("../lib/utilities/sykb");
    const database = (await import("../lib/db")).default;
    db = database;
    await t.test(
      "imports renamed MP4, metadata, thumbnail and suggestions, then cleans workspace",
      async () => {
        const phases: string[] = [];
        const transfers: unknown[] = [];
        const result = await downloadSykb(
          { ...input, url: input.url + "?pwd=zz99" },
          (p) => {
            if (phases.at(-1) !== p.phase) phases.push(p.phase);
            if (p.phase === "downloading" && p.received > 0) transfers.push(p);
          },
        );
        assert.equal(result.filename, "Example video.mp4");
        assert.ok(Array.isArray(result.autoTagSuggestions));
        const record = database
          .prepare(
            "SELECT title, duration_sec, thumbnail FROM videos WHERE id = ?",
          )
          .get(result.videoId) as {
          title: string;
          duration_sec: number;
          thumbnail: string;
        };
        assert.equal(record.title, input.name);
        assert.ok(record.duration_sec > 0);
        assert.ok(record.thumbnail);
        assert.deepEqual(phases, ["downloading", "extracting", "importing"]);
        assert.deepEqual(transfers, [
          { phase: "downloading", received: 1536, total: 3072 },
        ]);
        assert.equal(await readFile(configFile, "utf8"), config);
        const trace = (await readFile(process.env.SYKB_TEST_TRACE!, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        assert.deepEqual(trace.at(-1).args, [
          "transfer",
          "--download",
          input.url,
          input.code,
        ]);
        await assert.rejects(readdir(trace.at(-1).directory), {
          code: "ENOENT",
        });
      },
    );
    await t.test("rejects identical content with another title", async () => {
      await assert.rejects(
        downloadSykb({ ...input, name: "Completely different title" }),
        { code: "downloadDuplicate" },
      );
      assert.equal(
        (
          database.prepare("SELECT count(*) AS n FROM videos").get() as {
            n: number;
          }
        ).n,
        1,
      );
    });
    await t.test(
      "detects upstream failure even when exit status is zero",
      async () => {
        process.env.SYKB_TEST_FAIL = "1";
        await assert.rejects(
          downloadSykb({ ...input, name: "Unrelated failed import" }),
          { code: "baiduDownloadFailed" },
        );
        delete process.env.SYKB_TEST_FAIL;
        const trace = (await readFile(process.env.SYKB_TEST_TRACE!, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        await assert.rejects(readdir(trace.at(-1).directory), {
          code: "ENOENT",
        });
      },
    );
    await t.test("cancel stops the transfer and cleans workspace", async () => {
      process.env.SYKB_TEST_HANG = "1";
      const controller = new AbortController();
      const reason = new Error("canceled");
      setTimeout(() => controller.abort(reason), 300);
      await assert.rejects(
        downloadSykb(
          { ...input, name: "Canceled download" },
          () => {},
          controller.signal,
        ),
        (error) => error === reason,
      );
      delete process.env.SYKB_TEST_HANG;
      const trace = (await readFile(process.env.SYKB_TEST_TRACE!, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      await assert.rejects(readdir(trace.at(-1).directory), {
        code: "ENOENT",
      });
    });
    await t.test(
      "queued downloads record failures and honor cancel",
      async () => {
        const { enqueueDownload, requestTaskCancel } =
          await import("../lib/taskRunner");
        const { getJob } = await import("../lib/jobs");
        const settle = async (id: number, status?: string) => {
          for (let i = 0; i < 200; i++) {
            const job = getJob(database, id)!;
            if (status ? job.status === status : job.finishedAt) return job;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          throw new Error(`task ${id} did not settle`);
        };

        const failedId = enqueueDownload(database, "sykb", {
          ...input,
          name: "Queued duplicate",
        })!;
        assert.equal(
          enqueueDownload(database, "sykb", {
            ...input,
            name: "Queued duplicate",
          }),
          null,
        );
        const failed = await settle(failedId);
        assert.equal(failed.status, "failed");
        assert.equal(
          (failed.outcome as { error: { code: string } }).error.code,
          "downloadDuplicate",
        );
        assert.ok((failed.outcome as { video: unknown }).video);

        process.env.SYKB_TEST_HANG = "1";
        const canceledId = enqueueDownload(database, "sykb", {
          ...input,
          name: "Queued cancel",
        })!;
        await settle(canceledId, "running");
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(
          (getJob(database, canceledId)!.progress as { phase: string }).phase,
          "downloading",
        );
        requestTaskCancel(canceledId);
        assert.equal((await settle(canceledId)).status, "canceled");
        delete process.env.SYKB_TEST_HANG;

        const { startDownload } = await import("../lib/taskRunner");
        const { listDownloads } = await import("../lib/utilities/downloadJobs");
        const parkedId = enqueueDownload(
          database,
          "sykb",
          { ...input, name: "Parked download" },
          { start: false },
        )!;
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(getJob(database, parkedId)!.status, "pending");
        const found = listDownloads(database, "parked");
        assert.deepEqual(
          found.downloads.map((job) => job.id),
          [parkedId],
        );
        assert.deepEqual(found.downloads[0].payload, {
          source: "sykb",
          name: "Parked download",
          url: input.url,
        });
        assert.equal(
          listDownloads(database).downloads[0].id,
          parkedId,
          "pending sorts above finished downloads",
        );

        assert.ok(startDownload(database, parkedId));
        assert.equal((await settle(parkedId)).status, "failed");
        assert.ok(startDownload(database, parkedId), "retries in place");
        assert.equal((await settle(parkedId)).status, "failed");
        assert.equal(
          listDownloads(database, "parked").total,
          1,
          "a retry keeps one history entry",
        );
      },
    );
    await t.test("Qinglanhua retains its shared import behavior", async () => {
      const { downloadQinglanhua } =
        await import("../lib/utilities/qinglanhua");
      const fetchBefore = globalThis.fetch;
      const bytes = await readFile(innerZip);
      globalThis.fetch = async () => new Response(bytes);
      try {
        await assert.rejects(
          downloadQinglanhua({
            name: "Different Qinglanhua fixture",
            url: "https://example.test/file.zip",
            password: "",
          }),
          { code: "downloadDuplicate" },
        );
      } finally {
        globalThis.fetch = fetchBefore;
      }
    });
  } finally {
    db?.close();
    process.env = originalEnv;
    await rm(root, { recursive: true, force: true });
  }
});
