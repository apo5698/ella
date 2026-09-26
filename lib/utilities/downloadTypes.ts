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

/** One entry of a downloaded share, with nested archives opened. */
export type ArchiveNode = {
  name: string;
  /** Relative to the task's workspace, with `/` separators. Identifies it. */
  path: string;
  kind: "directory" | "archive" | "file";
  size: number;
  /** The extension a video would be stored under; null when not a video. */
  video: string | null;
  /** Error code when an archive could not be opened. */
  error?: string;
  children?: ArchiveNode[];
};

export type DownloadInspection = {
  tree: ArchiveNode[];
  /** Set when the listing stopped at its size limit. */
  truncated: boolean;
};

/**
 * Files kept after a download whose layout the source did not expect, so the
 * user can choose the video. Removed with the task, or on a fresh retry.
 */
export type RetainedDownload = DownloadInspection & { workspace: string };

/** `background_jobs.payload` of a VIDEO_DOWNLOAD task. */
export type DownloadJobPayload = {
  source: DownloaderSource;
  /** Top level so the queue can refuse a second active task of one name. */
  name: string;
  input: Record<string, unknown>;
  /** A file chosen from a retained download, to import instead. */
  selection?: RetainedDownload & { path: string };
  /** Queue recognition of the imported video, in this interface locale. */
  recognize?: { locale?: string };
};

/** `background_jobs.outcome` of a failed VIDEO_DOWNLOAD task. */
export type DownloadJobFailure = {
  error: ErrorDetails;
  video?: VideoRef | null;
  retained?: RetainedDownload;
};

export type DownloadProgressPresentation = {
  label: string;
  percent: number | null;
  detail?: string | null;
};
