"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGridIcon, Rows2Icon, TagsIcon } from "lucide-react";
import ListSkeleton from "./ListSkeleton";
import TagAutocomplete from "@/components/TagAutocomplete";
import { RemovableTagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isMarkedHistoryEntry, markHistoryEntry } from "@/lib/historyRestore";
import { parseHomeFilters } from "@/lib/homeFilters";
import type { TagCount, VideoCardData } from "@/lib/types";
import { VIDEO_SORT_LABELS, VIDEO_SORT_OPTIONS } from "@/lib/videoSort";
import { setGridLayout, useGridLayout } from "./useGridLayout";
import { useHomeNavigate } from "./useHomeNavigate";
import VirtualVideoGrid from "./VirtualVideoGrid";

const PAGE_SIZE = 48;
const CACHE_PREFIX = "ella:browse:";

type ListState = {
  key: string;
  videos: VideoCardData[];
  total: number;
  pages: number;
  fresh: Set<number>;
  restoreY: number | null;
};

type Cached = Pick<ListState, "videos" | "total" | "pages"> & {
  scrollY: number;
};

function readCache(key: string): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: Cached) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // A full session store only costs the scroll position.
  }
}

/** The request a set of URL parameters stands for, without display hints. */
function requestKey(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("view");
  next.sort();
  return next.toString();
}

function initialState(key: string): ListState {
  const empty = {
    key,
    videos: [],
    total: 0,
    pages: 0,
    fresh: new Set<number>(),
    restoreY: null,
  };
  if (typeof window === "undefined" || !isMarkedHistoryEntry(key)) return empty;
  const cached = readCache(key);
  return cached ? { ...empty, ...cached, restoreY: cached.scrollY } : empty;
}

/**
 * The library narrowed by search, tags or series, in the chosen order. It
 * loads more as the viewer scrolls, and returns to the same place on "Back".
 */
export default function BrowseView({ tags }: { tags: TagCount[] }) {
  const t = useTranslations("Browse");
  const home = useTranslations("Home");
  const common = useTranslations("Common");
  const sortText = useTranslations("VideoSort");
  const params = useSearchParams();
  const navigate = useHomeNavigate();
  const layout = useGridLayout();
  const filters = parseHomeFilters(params);
  const key = requestKey(params);
  const [state, setState] = useState<ListState>(() => initialState(key));
  /** The page being fetched, so one is never asked for twice. */
  const inFlight = useRef<string | null>(null);

  // A different request starts a different list.
  if (state.key !== key) setState(initialState(key));

  const load = useCallback(
    (page: number, signal?: AbortSignal) => {
      const query = new URLSearchParams(key);
      query.set("page", String(page));
      query.set("pageSize", String(PAGE_SIZE));
      const request = `${key}#${page}`;
      if (inFlight.current === request) return;
      inFlight.current = request;
      fetch(`/api/videos?${query}`, { signal })
        .then(
          (response) =>
            response.json() as Promise<{
              videos: VideoCardData[];
              total: number;
            }>,
        )
        .then((data) =>
          setState((current) => {
            if (current.key !== key) return current;
            const seen = new Set(current.videos.map((video) => video.id));
            const added = data.videos.filter((video) => !seen.has(video.id));
            return {
              ...current,
              videos: page === 1 ? data.videos : [...current.videos, ...added],
              total: data.total,
              pages: page,
              fresh: new Set(
                (page === 1 ? data.videos : added).map((v) => v.id),
              ),
            };
          }),
        )
        .catch((error: Error) => {
          // A later page is asked for again on the next scroll. A failed
          // first page shows the empty state rather than loading forever.
          if (error.name === "AbortError" || page > 1) return;
          setState((current) =>
            current.key === key
              ? { ...current, videos: [], total: 0, pages: 1 }
              : current,
          );
        })
        .finally(() => {
          if (inFlight.current === request) inFlight.current = null;
        });
    },
    [key],
  );

  // The first page, unless the list came back from the session cache.
  useEffect(() => {
    if (state.pages > 0) return;
    const controller = new AbortController();
    load(1, controller.signal);
    return () => {
      controller.abort();
      inFlight.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  const remember = useCallback(() => {
    if (state.pages === 0) return;
    markHistoryEntry(key);
    writeCache(key, {
      videos: state.videos,
      total: state.total,
      pages: state.pages,
      scrollY: window.scrollY,
    });
  }, [key, state.pages, state.total, state.videos]);

  const hasMore = state.videos.length < state.total;
  const loadMore = useCallback(() => {
    if (hasMore) load(state.pages + 1);
  }, [hasMore, load, state.pages]);

  const update = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete("view");
    if (![...next.keys()].length) next.set("view", "all");
    navigate(next, { replace: true });
  };
  const setTags = (ids: number[]) =>
    update((next) => {
      if (ids.length) next.set("tags", ids.join(","));
      else next.delete("tags");
    });

  const tagName = (id: number) =>
    tags.find((tag) => tag.id === id)?.name ?? home("tagId", { id });
  const seriesName =
    filters.series && state.videos[0]?.series_name
      ? state.videos[0].series_name
      : null;
  const title = filters.q
    ? t("resultsFor", { q: filters.q })
    : seriesName
      ? seriesName
      : filters.tagIds.length
        ? filters.tagIds.map(tagName).join(" + ")
        : t("allVideos");
  const filtered =
    Boolean(filters.q) || filters.tagIds.length > 0 || Boolean(filters.series);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate text-2xl font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {state.pages > 0
                ? common("totalVideos", { count: state.total })
                : " "}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Wide screens always fit several columns. */}
            <ToggleGroup
              variant="outline"
              spacing={0}
              aria-label={t("layout")}
              value={[layout]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "double" || next === "single") setGridLayout(next);
              }}
              className="md:hidden"
            >
              <ToggleGroupItem value="double" aria-label={t("layoutDouble")}>
                <LayoutGridIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="single" aria-label={t("layoutSingle")}>
                <Rows2Icon />
              </ToggleGroupItem>
            </ToggleGroup>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>
                <TagsIcon data-icon="inline-start" />
                {common("tags")}
                {filters.tagIds.length > 0 && ` (${filters.tagIds.length})`}
              </PopoverTrigger>
              <PopoverContent align="end" className="max-w-[calc(100vw-2rem)]">
                <PopoverTitle>{common("filterTags")}</PopoverTitle>
                <TagAutocomplete
                  endpoint="/api/tags/suggest?limit=30"
                  mode="multi"
                  placeholder={home("searchTags")}
                  allowCreate={false}
                  disabledNames={filters.tagIds.map(tagName)}
                  onSelect={(_name, option) => {
                    if (option.id === undefined) return;
                    setTags(
                      filters.tagIds.includes(option.id)
                        ? filters.tagIds.filter((id) => id !== option.id)
                        : [...filters.tagIds, option.id],
                    );
                  }}
                  inputId="browse-tag-filter"
                  className="w-full"
                />
              </PopoverContent>
            </Popover>
            <Select
              value={filters.sort}
              onValueChange={(value) =>
                update((next) => next.set("sort", value as string))
              }
            >
              <SelectTrigger aria-label={common("sort")}>
                <SelectValue placeholder={common("sort")}>
                  {(value: string) =>
                    VIDEO_SORT_LABELS[value]
                      ? sortText(VIDEO_SORT_LABELS[value])
                      : common("sort")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {VIDEO_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {sortText(option.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {filtered && (
              <Button
                variant="ghost"
                onClick={() =>
                  update((next) => {
                    next.delete("q");
                    next.delete("tags");
                    next.delete("series");
                  })
                }
              >
                {common("clearFilters")}
              </Button>
            )}
          </div>
        </div>
        {filters.tagIds.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1"
            aria-label={home("selectedTags")}
          >
            {filters.tagIds.map((id) => {
              const tag = tags.find((item) => item.id === id);
              const name = tagName(id);
              return (
                <RemovableTagBadge
                  key={id}
                  state={tag?.reviewState}
                  removeLabel={home("removeFilter", { name })}
                  className="min-h-6 max-w-full"
                  onClick={() =>
                    setTags(filters.tagIds.filter((tagId) => tagId !== id))
                  }
                >
                  <span className="truncate">{name}</span>
                </RemovableTagBadge>
              );
            })}
          </div>
        )}
      </header>

      {state.pages === 0 ? (
        <ListSkeleton />
      ) : state.videos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{common("noMatchingVideos")}</EmptyTitle>
            <EmptyDescription>{home("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <VirtualVideoGrid
            videos={state.videos}
            fresh={state.fresh}
            hasMore={hasMore}
            onEndReached={loadMore}
            onOpen={remember}
            restoreY={state.restoreY}
          />
          {hasMore && <ListSkeleton rows={1} />}
        </>
      )}
    </div>
  );
}
