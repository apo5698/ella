import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import semanticRelease from "semantic-release";
import { prerelease, valid, rcompare } from "semver";
import config from "../release.config.mjs";

const mode = process.argv[2];
if (!["plan", "publish"].includes(mode)) {
  throw new Error("Use release.mjs plan or release.mjs publish.");
}

const expectedVersion = process.env.EXPECTED_RELEASE_VERSION;
if (mode === "publish" && !valid(expectedVersion)) {
  throw new Error(
    "EXPECTED_RELEASE_VERSION must match the version of the built image.",
  );
}

const result = await semanticRelease({
  ...config,
  dryRun: mode === "plan",
  plugins: [
    ...config.plugins,
    {
      verifyRelease(_options, { nextRelease }) {
        if (mode === "publish" && nextRelease.version !== expectedVersion) {
          throw new Error(
            "The release version changed. Rebuild the image before publishing.",
          );
        }
      },
    },
  ],
});

if (mode === "publish") {
  if (!result)
    throw new Error(
      "No release was published. Check whether main advanced during the build.",
    );
} else {
  let version = result ? result.nextRelease.version : null;
  if (!version) {
    const git = (...args) =>
      execFileSync("git", args, { encoding: "utf8" }).trim();
    const tags = git("tag", "--merged", "HEAD")
      .split("\n")
      .filter((tag) => tag.startsWith("v") && valid(tag) && !prerelease(tag))
      .sort(rcompare);
    const tag = tags[0];
    if (!tag)
      throw new Error(
        "Create an initial SemVer release before running this workflow.",
      );
    const head = git("rev-parse", "HEAD");
    version =
      git("rev-list", "-n", "1", tag) === head
        ? valid(tag)
        : `${valid(tag)}-dev.${head.slice(0, 12)}`;
  }
  if (!process.env.GITHUB_OUTPUT)
    throw new Error("GITHUB_OUTPUT is required in plan mode.");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nrelease=${Boolean(result)}\n`,
  );
}
