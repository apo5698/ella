"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import VideoLink from "@/components/VideoLink";
import PageContainer from "@/components/PageContainer";
import { formatDuration } from "@/lib/format";
import { SCROLL_KEY } from "@/lib/browserState";
import { resolutionLabel } from "@/lib/tagger";
import type { Video, TagCount } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeriesBadge, TagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import ListPagination from "@/components/ListPagination";
import SearchInput from "@/components/SearchInput";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_SORT_LABELS, VIDEO_SORT_OPTIONS } from "@/lib/videoSort";

const PAGE_SIZE = 60;

function parseTagIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const n = parseInt(searchParams.get("page") ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [activeTagIds, setActiveTagIds] = useState<number[]>(() =>
    parseTagIds(searchParams.get("tags")),
  );
  const [activeSeriesId, setActiveSeriesId] = useState<number | null>(() => {
    const raw = parseInt(searchParams.get("series") ?? "", 10);
    return Number.isFinite(raw) ? raw : null;
  });
  const [sort, setSort] = useState(() => searchParams.get("sort") ?? "views");
  const [tags, setTags] = useState<TagCount[]>([]);
  const [loadedRequest, setLoadedRequest] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags));
  }, []);

  // Compares the filters themselves rather than counting runs. A "skip the
  // first pass" flag looks equivalent but is not: effects are invoked twice on
  // mount in development, and the second pass would discard a page number
  // restored from the URL.
  const lastFilters = useRef<string | null>(null);
  useEffect(() => {
    const current = JSON.stringify([
      debouncedQ,
      activeTagIds,
      activeSeriesId,
      sort,
    ]);
    if (lastFilters.current === current) return;
    const first = lastFilters.current === null;
    lastFilters.current = current;
    if (!first) setPage(1);
  }, [debouncedQ, activeTagIds, activeSeriesId, sort]);

  const requestKey = JSON.stringify([
    debouncedQ,
    activeTagIds,
    activeSeriesId,
    sort,
    page,
  ]);
  const loading = loadedRequest !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (activeTagIds.length > 0) params.set("tags", activeTagIds.join(","));
    if (activeSeriesId !== null) params.set("series", String(activeSeriesId));
    params.set("sort", sort);
    params.set("page", String(page));
    fetch(`/api/videos?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setVideos(d.videos);
        setTotal(d.total);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setVideos([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedRequest(requestKey);
      });
    return () => controller.abort();
  }, [debouncedQ, activeTagIds, activeSeriesId, sort, page, requestKey]);

  // Mirror the whole view into the URL. Search, sort and page used to live
  // only in memory, so coming back from a video landed on the default list.
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (activeTagIds.length > 0) params.set("tags", activeTagIds.join(","));
    if (activeSeriesId !== null) params.set("series", String(activeSeriesId));
    if (sort !== "views") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, activeTagIds, activeSeriesId, sort, page]);

  // Record the scroll offset against the view it belongs to, so a different
  // filter does not inherit a position from an unrelated list.
  const viewKey = `${SCROLL_KEY}:${searchParams.toString()}`;
  // Recorded when a card is opened rather than tracked as the page scrolls.
  // A scroll listener would have to be throttled, and reading the offset while
  // unwinding is too late: the router has scrolled the incoming page to the
  // top by then, so the only value left to read is zero.
  function rememberScroll() {
    sessionStorage.setItem(viewKey, String(window.scrollY));
  }

  // Restoring has to wait for the cards: the list is fetched after mount, and
  // scrolling an empty page goes nowhere. Cards reserve their height, so the
  // offset is valid as soon as they render.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || loading || videos.length === 0) return;
    restored.current = true;
    const y = Number(sessionStorage.getItem(viewKey) ?? 0);
    if (y > 0) window.scrollTo(0, y);
  }, [loading, videos, viewKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function clickTag(name: string) {
    fetch("/api/tags/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  }

  function toggleTag(id: number, name: string) {
    clickTag(name);
    setActiveTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  function toggleSeries(id: number) {
    setActiveSeriesId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <PageContainer>
        <h1 className="sr-only">视频库</h1>
        <div className="flex gap-3 mb-4">
          <SearchInput
            value={q}
            onValueChange={setQ}
            placeholder="搜索标题、文件名、标签或拼音"
            className="flex-1"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as string)}>
            <SelectTrigger aria-label="排序">
              <SelectValue placeholder="排序">
                {(v: string) => VIDEO_SORT_LABELS[v] ?? "排序"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {VIDEO_SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {(q || activeTagIds.length > 0 || activeSeriesId !== null) && (
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setActiveTagIds([]);
                setActiveSeriesId(null);
              }}
            >
              清除筛选
            </Button>
          )}
        </div>

        <div className="mb-6 flex flex-wrap gap-1">
          {tags.slice(0, 50).map((t) => (
            <TagBadge
              key={t.id}
              render={<button type="button" />}
              state={t.reviewState}
              className={cn(
                "min-h-6 cursor-pointer sm:min-h-5",
                activeTagIds.includes(t.id) && "ring-2 ring-primary",
              )}
              onClick={() => toggleTag(t.id, t.name)}
            >
              {t.name} <span>{t.count}</span>
            </TagBadge>
          ))}
        </div>

        <div className="mb-3 text-xs text-foreground">
          {loading ? "加载中" : `共 ${total} 个视频`}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {videos.map((v) => (
            <Card key={v.id} className="p-0 gap-0 overflow-hidden">
              <VideoLink
                href={`/video/${v.id}`}
                className="group block"
                onClick={rememberScroll}
              >
                <div className="aspect-video bg-muted overflow-hidden relative">
                  {v.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="w-full h-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      无缩略图
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 flex gap-1">
                    {resolutionLabel(v.width, v.height) && (
                      <Badge
                        variant="secondary"
                        className="bg-black/70 text-white border-0"
                      >
                        {resolutionLabel(v.width, v.height)}
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="bg-black/70 text-white border-0"
                    >
                      {formatDuration(v.duration_sec)}
                    </Badge>
                  </div>
                </div>
                <div className="px-2.5 pt-2">
                  <div className="text-sm truncate" title={v.title}>
                    {v.title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    播放次数 {v.views}
                  </div>
                </div>
              </VideoLink>
              <div className="flex flex-wrap gap-1 px-2.5 pb-2.5 pt-1">
                {/* The series always leads, so a card's origin reads first. */}
                {v.series_id !== null && v.series_name && (
                  <SeriesBadge
                    render={<button type="button" />}
                    className={cn(
                      "min-h-6 cursor-pointer sm:min-h-5",
                      activeSeriesId === v.series_id && "ring-2 ring-primary",
                    )}
                    onClick={() => toggleSeries(v.series_id!)}
                  >
                    {v.series_name}
                  </SeriesBadge>
                )}
                {v.tags.slice(0, 3).map((t) => (
                  <TagBadge
                    key={t.id}
                    render={<button type="button" />}
                    source={t.source}
                    className={cn(
                      "min-h-6 cursor-pointer sm:min-h-5",
                      activeTagIds.includes(t.id) && "ring-2 ring-primary",
                    )}
                    onClick={() => toggleTag(t.id, t.name)}
                  >
                    {t.name}
                  </TagBadge>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {!loading && videos.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>未找到匹配的视频</EmptyTitle>
              <EmptyDescription>请调整搜索词或清除筛选条件。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {totalPages > 1 && (
          <ListPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-8 justify-center"
          />
        )}
      </PageContainer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
