import type { AutoTagSuggestion } from "@/lib/autoTagging";
import type { ErrorDetails } from "@/lib/appError";
import type { ContentMatch, NameMatch, VideoRef } from "@/lib/duplicates";
import type { DownloaderSource } from "@/lib/utilities/registry";

export type ImportedDownloadResult = {
  videoId: number;
  filename: string;
  title: string;
  truncated: boolean;
  duplicates: ContentMatch[];
  similar: NameMatch[];
  autoTagSuggestions: AutoTagSuggestion[];
};

/** Refusal returned by the request that would have queued a download. */
export type DownloadFailure = {
  error: string;
  reason?: "name" | "file" | "similar";
  video?: (VideoRef & { score?: number }) | null;
};

/** Shared by every source so one list can show any download. */
export type DownloadProgress =
  | { phase: "downloading"; received: number; total: number | null }
  | {
      phase: "extracting";
      percent: number | null;
      /** Present when the source unpacks nested archives. */
      layer?: number;
      layers?: number;
    }
  | { phase: "importing" };

export type DownloadProgressReporter = (progress: DownloadProgress) => void;

/** `background_jobs.payload` of a VIDEO_DOWNLOAD task. */
export type DownloadJobPayload = {
  source: DownloaderSource;
  /** Top level so the queue can refuse a second active task of one name. */
  name: string;
  input: Record<string, unknown>;
};

/** `background_jobs.outcome` of a failed VIDEO_DOWNLOAD task. */
export type DownloadJobFailure = {
  error: ErrorDetails;
  video?: VideoRef | null;
};

export type DownloadProgressPresentation = {
  label: string;
  percent: number | null;
  detail?: string | null;
};
