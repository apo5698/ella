import type Database from "better-sqlite3";
import { listJobsOfKind, type Job } from "@/lib/jobs";
import { matchesPinyinSearch, normalizeSearchText } from "@/lib/pinyinSearch";
import type {
  DownloadJobPayload,
  ImportedDownloadResult,
} from "@/lib/utilities/downloadTypes";

/** Enough history for a page; a search reaches past it. */
export const DOWNLOAD_LIST_LIMIT = 200;

/** What the list shows of a download's payload. */
export type DownloadListPayload = {
  source: DownloadJobPayload["source"];
  name: string;
  url: string | null;
};

export type DownloadListItem = Omit<Job, "payload"> & {
  payload: DownloadListPayload;
};

export type DownloadList = {
  downloads: DownloadListItem[];
  /** Matches before the limit, so the page can say the list is cut. */
  total: number;
};

/**
 * The download history, filtered by name. Matching follows the rest of the
 * library, so a Chinese name is also found by its pinyin or initials.
 *
 * The share code and archive password stay on the server: the list is pushed
 * to every open download page and has no use for them.
 */
export function listDownloads(db: Database.Database, query = ""): DownloadList {
  const normalized = normalizeSearchText(query);
  const matches = listJobsOfKind(db, "VIDEO_DOWNLOAD").filter((job) => {
    if (!normalized) return true;
    const { name } = job.payload as DownloadJobPayload;
    const title = (job.outcome as ImportedDownloadResult | null)?.title;
    return (
      matchesPinyinSearch(String(name ?? ""), normalized) ||
      (typeof title === "string" && matchesPinyinSearch(title, normalized))
    );
  });
  return {
    total: matches.length,
    downloads: matches.slice(0, DOWNLOAD_LIST_LIMIT).map((job) => {
      const { source, name, input } = job.payload as DownloadJobPayload;
      return {
        ...job,
        payload: {
          source,
          name,
          url: typeof input?.url === "string" ? input.url : null,
        },
      };
    }),
  };
}
