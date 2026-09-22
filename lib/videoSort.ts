export const VIDEO_SORT_OPTIONS = [
  { value: "newest", label: "newest" },
  { value: "oldest", label: "oldest" },
  { value: "views", label: "views" },
  { value: "duration_desc", label: "duration_desc" },
  { value: "duration_asc", label: "duration_asc" },
  { value: "title", label: "title" },
] as const;

export const VIDEO_SORT_LABELS: Record<string, string> = Object.fromEntries(
  VIDEO_SORT_OPTIONS.map((option) => [option.value, option.label]),
);

export const SERIES_SORT_OPTIONS = [
  { value: "name", label: "name" },
  { value: "count_desc", label: "count_desc" },
  { value: "count_asc", label: "count_asc" },
] as const;

export const SERIES_SORT_LABELS: Record<string, string> = Object.fromEntries(
  SERIES_SORT_OPTIONS.map((option) => [option.value, option.label]),
);

export const DEFAULT_SERIES_SORT = "name";
