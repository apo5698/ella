import { compare, valid } from "semver";
import { z } from "zod";

export const RELEASES_URL = "https://github.com/apo5698/ella/releases";
const LATEST_RELEASE_API =
  "https://api.github.com/repos/apo5698/ella/releases/latest";

const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
});

export type ReleaseStatus =
  | { status: "available"; version: string; url: string }
  | { status: "empty" }
  | { status: "unavailable" };

export async function getLatestRelease(): Promise<ReleaseStatus> {
  try {
    const options = {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Ella",
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    };
    const response = await fetch(LATEST_RELEASE_API, options);
    if (response.status === 404) return { status: "empty" };
    if (!response.ok) return { status: "unavailable" };
    const release = releaseSchema.safeParse(await response.json());
    if (!release.success) return { status: "unavailable" };
    const version = valid(release.data.tag_name);
    if (!version) return { status: "unavailable" };
    return {
      status: "available",
      version,
      url: `${RELEASES_URL}/tag/${encodeURIComponent(release.data.tag_name)}`,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function compareVersions(current: string, latest: string) {
  if (!valid(current) || !valid(latest)) return null;
  return compare(current, latest);
}
