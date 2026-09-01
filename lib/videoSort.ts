/**
 * The wording of every sort control in the app, in one place so the home page
 * and the management page cannot drift apart.
 *
 * One rule across all of them: an option names what reaches the top of the
 * list rather than a direction. "最多" says which end you get; "降序" asks the
 * reader to work it out. Text is the exception, where A-Z is the established
 * form and a direction word would carry no meaning.
 *
 * The values are the `sort` parameter of /api/videos, which is where the
 * ordering itself lives.
 */
export const VIDEO_SORT_OPTIONS = [
  { value: "newest", label: "最近添加" },
  { value: "oldest", label: "最早添加" },
  { value: "views", label: "播放次数最多" },
  { value: "duration_desc", label: "时长最长" },
  { value: "duration_asc", label: "时长最短" },
  { value: "title", label: "标题 A-Z" },
] as const;

export const VIDEO_SORT_LABELS: Record<string, string> = Object.fromEntries(
  VIDEO_SORT_OPTIONS.map((option) => [option.value, option.label]),
);

/**
 * The order of the series themselves, which is a separate question from the
 * order of the videos inside one. Every label keeps its 系列 prefix: the two
 * controls sit side by side, and each trigger shows only its own value.
 */
export const SERIES_SORT_OPTIONS = [
  { value: "name", label: "系列名称 A-Z" },
  { value: "count_desc", label: "系列视频最多" },
  { value: "count_asc", label: "系列视频最少" },
] as const;

export const SERIES_SORT_LABELS: Record<string, string> = Object.fromEntries(
  SERIES_SORT_OPTIONS.map((option) => [option.value, option.label]),
);

export const DEFAULT_SERIES_SORT = "name";
