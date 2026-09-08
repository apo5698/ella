# Releases

The `Build and release` workflow runs after a push to `main`.
It uses [semantic-release](https://semantic-release.org/) and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

| Commit                                      | Version change | Example from 0.1.0 |
| ------------------------------------------- | -------------- | ------------------ |
| `fix: ...` or `perf: ...`                   | Patch          | 0.1.1              |
| `feat: ...`                                 | Minor          | 0.2.0              |
| `feat!: ...` or a `BREAKING CHANGE:` footer | Major          | 1.0.0              |
| `docs: ...`, `chore: ...`, or `ci: ...`     | No release     | 0.1.0              |

The largest change since the last release determines the next version.
These rules also apply before version 1.0.0.
For a squash merge, use a Conventional Commit title for the final commit.

The workflow checks types and version rules, then calculates the release version.
It builds and pushes Docker images for amd64 and arm64 before it creates the GitHub Release.
The image tags include `latest`, the commit SHA, and the release version, such as `0.2.0`.
The built image receives `APP_VERSION`, which the system settings page shows as the current version.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write` and `packages: write`.
It does not publish to npm or commit generated version changes to `main`.
Git tags are the release version source. `package.json` supplies the fallback version for local development.
For commits without a release, images use `<last-version>-dev.<commit>` as their version.

The release runs in the same workflow as the image build.
It does not depend on a release event from `GITHUB_TOKEN` to start another workflow.

To retry a failed run, use **Run workflow** on `main` in GitHub Actions.
The workflow checks existing tags and skips releases without new releasable commits.
To check the version rules locally, run `bun run check:releases`.

The settings page queries the GitHub API and caches the latest release for one hour.
It shows a fallback message when GitHub has no release or the request fails.

Release checks use anonymous requests to the public repository. No credentials are required in the app.
