/** What narrows the home page, as it travels in the URL. Client safe. */
export type HomeFilters = {
  q: string;
  tagIds: number[];
  series: string;
  sort: string;
};

export const DEFAULT_SORT = "views";

export function parseHomeFilters(params: URLSearchParams): HomeFilters {
  return {
    q: params.get("q")?.trim() ?? "",
    tagIds: (params.get("tags") ?? "")
      .split(",")
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isFinite(value)),
    series: params.get("series") ?? "",
    sort: params.get("sort") ?? DEFAULT_SORT,
  };
}

/**
 * True when the URL asks for a list rather than the curated home page: any
 * filter, an explicit sort, or `view=all`.
 */
export function isBrowsing(params: URLSearchParams) {
  return ["q", "tags", "series", "sort", "view"].some((key) => params.has(key));
}

export function homeHref(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
