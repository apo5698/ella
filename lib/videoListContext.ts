/**
 * The list a video was opened from, carried in the editor's URL so that the
 * previous and next buttons walk the same videos in the same order.
 *
 * Kept free of server imports: the lists build these links in the browser.
 */
const CONTEXT_KEYS = ["q", "tags", "tagMode", "series", "sort"] as const;

export type VideoListContext = Partial<
  Record<(typeof CONTEXT_KEYS)[number], string>
>;

/** The editor's address for one video, within an optional list. */
export function videoEditorHref(
  videoId: number,
  context: VideoListContext | URLSearchParams = {},
): string {
  const params = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value =
      context instanceof URLSearchParams ? context.get(key) : context[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query
    ? `/admin/videos/${videoId}?${query}`
    : `/admin/videos/${videoId}`;
}
