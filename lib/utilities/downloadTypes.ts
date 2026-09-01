import type { AutoTagSuggestion } from "@/lib/autoTagging";
import type { ContentMatch, NameMatch, VideoRef } from "@/lib/duplicates";

export type ImportedDownloadResult = {
  videoId: number;
  filename: string;
  title: string;
  truncated: boolean;
  duplicates: ContentMatch[];
  similar: NameMatch[];
  autoTagSuggestions: AutoTagSuggestion[];
};

export type DownloadFailure = {
  error: string;
  reason?: "name" | "file" | "similar";
  video?: (VideoRef & { score?: number }) | null;
};

export type DownloadStreamEvent<TProgress> =
  | { kind: "progress"; progress: TProgress }
  | { kind: "done"; result: ImportedDownloadResult }
  | { kind: "error"; error: string; video: VideoRef | null };

export type DownloadProgressPresentation = {
  label: string;
  percent: number | null;
  detail?: string | null;
};
