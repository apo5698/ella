import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { inc } from "semver";
import { commitAnalyzerOptions } from "../release.config.mjs";

test("generates release notes with the installed changelog preset", async () => {
  const notes = await generateNotes(
    { preset: "conventionalcommits" },
    {
      cwd: process.cwd(),
      options: { repositoryUrl: "https://github.com/apo5698/ella.git" },
      commits: [{ hash: "a".repeat(40), message: "feat: add system settings" }],
      lastRelease: { gitTag: "v0.1.0" },
      nextRelease: { version: "0.2.0", gitTag: "v0.2.0" },
      logger: { log() {} },
    },
  );
  assert.match(notes, /0\.2\.0/);
  assert.match(notes, /add system settings/);
});

for (const [message, type, version] of [
  ["fix: repair settings", "patch", "0.1.1"],
  ["perf: reduce startup time", "patch", "0.1.1"],
  ["feat: add system settings", "minor", "0.2.0"],
  ["feat(api)!: remove an endpoint", "major", "1.0.0"],
  [
    "refactor: change configuration\n\nBREAKING CHANGE: remove the old format",
    "major",
    "1.0.0",
  ],
  ["docs: update instructions", null, null],
  ["chore: update tooling", null, null],
  ["ci: update workflow", null, null],
]) {
  test(message.split("\n")[0], async () => {
    const actual = await analyzeCommits(commitAnalyzerOptions, {
      commits: [{ hash: "abc123", message }],
      logger: { log() {} },
      cwd: process.cwd(),
    });
    assert.equal(actual, type);
    assert.equal(actual ? inc("0.1.0", actual) : null, version);
  });
}

test("the largest change determines the release version", async () => {
  const actual = await analyzeCommits(commitAnalyzerOptions, {
    commits: [
      "fix: repair settings",
      "feat: add settings",
      "fix!: remove a legacy format",
    ].map((message) => ({ hash: "abc123", message })),
    logger: { log() {} },
    cwd: process.cwd(),
  });
  assert.equal(actual, "major");
});
