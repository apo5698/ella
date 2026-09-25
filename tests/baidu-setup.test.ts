import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

test("Baidu setup preserves working credentials and never returns cookies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ella-setup-test-"));
  const savedEnv = { ...process.env };
  try {
    process.env.DB_PATH = path.join(root, "catalog.db");
    process.env.VIDEO_ROOT = path.join(root, "videos");
    process.env.BAIDUPCS_GO_CONFIG_DIR = path.join(root, "config");
    process.env.BAIDUPCS_GO_PATH = path.join(root, "pcs");
    await mkdir(process.env.VIDEO_ROOT);
    await writeFile(
      process.env.BAIDUPCS_GO_PATH,
      `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('BaiduPCS-Go v4.0.2'); process.exit(0); }
const directory = process.env.BAIDUPCS_GO_CONFIG_DIR;
if (args[0] === 'login') {
  if (args[1].includes('invalid')) { console.log('login failed'); process.exit(0); }
  fs.writeFileSync(path.join(directory, 'pcs_config.json'), JSON.stringify({baidu_active_uid: 1, baidu_user_list:[{uid:1, name:'Fixture account', bduss:'private-fixture', cookies:'BDUSS=private-fixture; STOKEN=private-token;'}]}));
}
if (args[0] === 'quota') console.log(process.env.TEST_EXPIRED ? 'error' : '总空间: 1GB');
`,
      { mode: 0o700 },
    );
    const setup = await import("../lib/utilities/baiduSetup");
    assert.throws(() => setup.normalizeBaiduCookies("BDUSS=only"), {
      code: "baiduCookiesInvalid",
    });
    assert.throws(() => setup.normalizeBaiduCookies("BDUSS=a;\nSTOKEN=b;"), {
      code: "baiduCookiesInvalid",
    });
    assert.equal(
      setup.normalizeBaiduCookies("Cookie: BDUSS=a; STOKEN=b"),
      "BDUSS=a; STOKEN=b;",
    );
    const before = await setup.baiduSetupStatus();
    assert.equal(before.account, null);
    assert.equal(before.installed, true);
    assert.equal(before.storageWritable, true);
    assert.equal(before.storageIssue, null);
    assert.equal(
      await setup.checkDownloadStorage(path.join(root, "missing")),
      "missing",
    );
    await setup.connectBaidu("BDUSS=fixture; STOKEN=fixture;");
    const configFile = path.join(
      process.env.BAIDUPCS_GO_CONFIG_DIR,
      "pcs_config.json",
    );
    const goodConfig = await readFile(configFile, "utf8");
    assert.equal((await stat(configFile)).mode & 0o777, 0o600);
    const after = await setup.baiduSetupStatus();
    assert.deepEqual(after.account, { name: "Fixture account" });
    assert.equal(JSON.stringify(after).includes("private"), false);
    await assert.rejects(setup.connectBaidu("BDUSS=invalid; STOKEN=invalid;"), {
      code: "baiduLoginFailed",
    });
    assert.equal(await readFile(configFile, "utf8"), goodConfig);
    await setup.verifyBaidu();
    process.env.TEST_EXPIRED = "1";
    await assert.rejects(setup.verifyBaidu(), { code: "baiduLoginFailed" });
    assert.deepEqual(await readdir(process.env.BAIDUPCS_GO_CONFIG_DIR), [
      "pcs_config.json",
    ]);
    assert.deepEqual(await readdir(process.env.VIDEO_ROOT), []);
    delete process.env.BAIDUPCS_GO_CONFIG_DIR;
    assert.equal(setup.baiduConfigDirectory(), path.join(root, "baidupcs"));
  } finally {
    process.env = savedEnv;
    await rm(root, { recursive: true, force: true });
  }
});
