export type VideoTag = { id: number; name: string; source: string };

export type VideoDetailTag = VideoTag & { path?: string[] };

export type VideoTagState = {
  tags: VideoDetailTag[];
  rejectedTags: string[];
  seriesName: string | null;
};

export type VideoMetadataPatch = {
  title: string;
  path: string;
  thumbnail?: string;
  thumbnailSec?: number;
};

export type Series = { id: number; name: string };

export type Video = {
  id: number;
  path: string;
  filename: string;
  title: string;
  ext: string;
  size_bytes: number;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  mtime: number;
  thumbnail: string | null;
  thumbnail_sec: number | null;
  created_at: number;
  views: number;
  series_id: number | null;
  series_name: string | null;
  tags: VideoTag[];
};

export type EditableVideo = Pick<
  Video,
  "id" | "title" | "path" | "duration_sec"
>;

export type TagProgress = { total: number; tagged: number; done: boolean };

export type TagCount = {
  id: number;
  name: string;
  count: number;
  reviewState: TagReviewState;
};

export type TagReviewState = "excluded" | "automatic" | "approved" | "category";

/**
 * `alias` is set when the query matched an alternate spelling. The name is
 * always the canonical tag, since that is what gets added.
 */
export type Suggestion = {
  id: number;
  name: string;
  count: number;
  reviewState?: TagReviewState;
  alias?: string | null;
};

/** One tag as the management page sees it, with its subtree attached. */
export type TagTreeNode = {
  id: number;
  name: string;
  parentId: number | null;
  /** Sources of active video associations for this exact tag. */
  sources: string[];
  /** Whether this tag has at least one rejected video association. */
  rejected: boolean;
  /** False for a tag that only groups others and cannot be put on a video. */
  assignable: boolean;
  /** Human review level for this tag, independent of any one video. */
  reviewState: TagReviewState;
  /** Videos carrying this exact tag. */
  count: number;
  /** Videos carrying this tag or anything below it. */
  totalCount: number;
  aliases: string[];
  children: TagTreeNode[];
};
