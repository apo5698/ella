"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  LibraryIcon,
  PlusIcon,
  RefreshCwIcon,
  TagsIcon,
} from "lucide-react";
import { toast } from "sonner";
import TagAutocomplete from "@/components/TagAutocomplete";
import type { Option as TagOption } from "@/components/TagAutocomplete";
import ListPagination from "@/components/ListPagination";
import LocalTime from "@/components/LocalTime";
import VideoLink from "@/components/VideoLink";
import {
  InlineSeriesBadge,
  RemovableSeriesBadge,
  RemovableTagBadge,
  SeriesBadge,
  TagBadge,
} from "@/components/tags/TagBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import SearchInput from "@/components/SearchInput";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MANAGER_PAGE_SIZES } from "@/lib/pagination";
import type { Video } from "@/lib/types";
import type { VideoEvent } from "@/lib/videoEvents";
import AutoTagDialog from "./AutoTagDialog";
import VideoRowActions from "./VideoRowActions";

type BatchAction = "add" | "remove";

function BatchTagDialog({
  action,
  count,
  open,
  onOpenChange,
  videoIds,
  onApplied,
}: {
  action: BatchAction;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoIds: number[];
  onApplied: (message: React.ReactNode) => void;
}) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const adding = action === "add";

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    setTags([]);
    setError("");
    onOpenChange(false);
  }

  async function apply() {
    if (tags.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/videos/batch/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: videoIds,
          names: tags.map((tag) => tag.name),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "更新失败，请重试。");
        return;
      }
      handleOpenChange(false);
      onApplied(
        `已为 ${count} 个视频${adding ? "添加" : "移除"} ${data.names.length} 个标签。`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adding ? "批量添加标签" : "批量移除标签"}</DialogTitle>
          <DialogDescription>
            将对已选择的 {count} 个视频执行此操作。
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel>标签</FieldLabel>
            <TagAutocomplete
              endpoint="/api/tags/suggest?assignable=1"
              mode="multi"
              placeholder={adding ? "搜索或新建标签" : "搜索要移除的标签"}
              disabledNames={tags.map((tag) => tag.name)}
              allowCreate={adding}
              onSelect={(_, option) =>
                setTags((current) => [...current, option])
              }
            />
            <FieldDescription>
              {adding
                ? "标签会作为已审核标签添加；已排除的同名标签会恢复。"
                : "已审核标签会移除，自动标签会记为已排除。"}
            </FieldDescription>
          </Field>
        </FieldGroup>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <RemovableTagBadge
                key={tag.name}
                state={adding ? "approved" : tag.reviewState}
                removeLabel={`移除"${tag.name}"`}
                title={adding ? "已审核" : "从选择中移除"}
                onClick={() =>
                  setTags((current) =>
                    current.filter((item) => item.name !== tag.name),
                  )
                }
              >
                {tag.name}
              </RemovableTagBadge>
            ))}
          </div>
        )}

        {error && <p className="text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled={tags.length === 0 || submitting} onClick={apply}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? "更新中" : "应用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchSeriesDialog({
  count,
  open,
  onOpenChange,
  videoIds,
  onApplied,
}: {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoIds: number[];
  onApplied: (message: React.ReactNode) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    setName(null);
    setError("");
    onOpenChange(false);
  }

  async function apply(nextName: string | null) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/videos/batch/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: videoIds, name: nextName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "更新失败，请重试。");
        return;
      }
      handleOpenChange(false);
      onApplied(
        nextName ? (
          <>
            已将 {count} 个视频的系列设为
            <InlineSeriesBadge>{data.series.name}</InlineSeriesBadge>
          </>
        ) : (
          `已清除 ${count} 个视频的系列。`
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批量设置系列</DialogTitle>
          <DialogDescription>
            所选系列将替换 {count} 个视频各自现有的系列。
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel>系列</FieldLabel>
            {name ? (
              <div className="flex flex-wrap gap-1">
                <RemovableSeriesBadge
                  removeLabel={`取消选择"${name}"`}
                  onClick={() => setName(null)}
                >
                  {name}
                </RemovableSeriesBadge>
              </div>
            ) : (
              <TagAutocomplete
                endpoint="/api/series/suggest"
                kind="series"
                mode="single"
                placeholder="搜索或新建系列"
                onSelect={setName}
              />
            )}
            <FieldDescription>
              每个视频只能属于一个系列，也可以清除所选视频的系列。
            </FieldDescription>
          </Field>
        </FieldGroup>

        {error && <p className="text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => apply(null)}
          >
            清除系列
          </Button>
          <Button disabled={!name || submitting} onClick={() => apply(name)}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? "更新中" : "应用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function videoResolution(video: Video) {
  return video.width && video.height
    ? `${video.width} × ${video.height}`
    : "未知分辨率";
}

const HEADER_SORTS = {
  title: ["title_asc", "title_desc"],
  size: ["size_desc", "size_asc"],
  clicks: ["clicks_desc", "clicks_asc"],
  views: ["views_desc", "views_asc"],
  modified: ["newest", "oldest"],
} as const;

const SORT_DIRECTIONS: Record<string, "asc" | "desc"> = {
  title_asc: "asc",
  title_desc: "desc",
  size_asc: "asc",
  size_desc: "desc",
  clicks_asc: "asc",
  clicks_desc: "desc",
  views_asc: "asc",
  views_desc: "desc",
  newest: "desc",
  oldest: "asc",
};

function SortableTableHead({
  label,
  sort,
  values,
  className,
  onSort,
}: {
  label: string;
  sort: string;
  values: readonly [string, string];
  className?: string;
  onSort: (sort: string) => void;
}) {
  const active = values.includes(sort);
  const direction = active ? SORT_DIRECTIONS[sort] : undefined;
  const nextSort = sort === values[0] ? values[1] : values[0];
  const nextDirection = SORT_DIRECTIONS[nextSort];
  const SortIcon =
    direction === "asc"
      ? ArrowUpIcon
      : direction === "desc"
        ? ArrowDownIcon
        : ArrowUpDownIcon;

  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn("text-xs text-muted-foreground", className)}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 cursor-pointer"
        title={`按${label}${nextDirection === "asc" ? "升序" : "降序"}排列`}
        onClick={() => onSort(nextSort)}
      >
        {label}
        <SortIcon data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}

function videoManagerHref({
  pathname,
  query,
  tagIds,
  sort,
  page,
  pageSize,
}: {
  pathname: string;
  query: string;
  tagIds: number[];
  sort: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tagIds.length > 0) params.set("tags", tagIds.join(","));
  if (sort !== "newest") params.set("sort", sort);
  if (page !== 1) params.set("page", String(page));
  if (pageSize !== MANAGER_PAGE_SIZES[0]) {
    params.set("pageSize", String(pageSize));
  }
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function VideoTable({
  videos,
  loading,
  selected,
  sort,
  returnHref,
  onToggleVideo,
  onTogglePage,
  onChanged,
  onDeleted,
  onSort,
}: {
  videos: Video[];
  loading: boolean;
  selected: Set<number>;
  sort: string;
  returnHref: string;
  onToggleVideo: (id: number, checked: boolean) => void;
  onTogglePage: (ids: number[], checked: boolean) => void;
  onChanged: () => void;
  onDeleted: (id: number) => void;
  onSort: (sort: string) => void;
}) {
  const currentIds = useMemo(() => videos.map((video) => video.id), [videos]);
  const allSelected =
    currentIds.length > 0 && currentIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && currentIds.some((id) => selected.has(id));

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="table-fixed">
        <TableHeader className="bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]">
          <TableRow>
            <TableHead className="w-12 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={() => onTogglePage(currentIds, !allSelected)}
                aria-label="全选当前页"
              />
            </TableHead>
            <SortableTableHead
              label="名称"
              sort={sort}
              values={HEADER_SORTS.title}
              onSort={onSort}
            />
            <SortableTableHead
              label="点击量"
              sort={sort}
              values={HEADER_SORTS.clicks}
              onSort={onSort}
              className="hidden w-[clamp(5rem,7vw,6rem)] lg:table-cell"
            />
            <SortableTableHead
              label="播放量"
              sort={sort}
              values={HEADER_SORTS.views}
              onSort={onSort}
              className="hidden w-[clamp(5rem,7vw,6rem)] lg:table-cell"
            />
            <SortableTableHead
              label="大小"
              sort={sort}
              values={HEADER_SORTS.size}
              onSort={onSort}
              className="hidden w-[clamp(5rem,8vw,7rem)] sm:table-cell"
            />
            <SortableTableHead
              label="修改时间"
              sort={sort}
              values={HEADER_SORTS.modified}
              onSort={onSort}
              className="hidden w-[clamp(6rem,10vw,8rem)] sm:table-cell"
            />
            <TableHead className="sticky right-0 z-10 w-12 bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] text-xs text-muted-foreground">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="bg-background hover:bg-background">
              <TableCell colSpan={7}>
                <LoadingSpinner />
              </TableCell>
            </TableRow>
          ) : (
            videos.map((video) => {
              const visibleTags = video.tags.slice(0, 3);
              const tagCount = video.tags.length;
              const checked = selected.has(video.id);

              return (
                <TableRow
                  key={video.id}
                  className="group bg-background hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]"
                  data-state={checked ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        onToggleVideo(video.id, value === true)
                      }
                      aria-label={`选择 ${video.title}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-0 items-center gap-3">
                      <VideoLink
                        href={`/video/${video.id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开视频：${video.title}`}
                        className="relative flex h-[45px] w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-xs text-muted-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span aria-hidden="true">无封面</span>
                        {video.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={video.thumbnail}
                            src={video.thumbnail}
                            alt=""
                            width={80}
                            height={45}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 size-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        )}
                      </VideoLink>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex min-w-0 items-center justify-between gap-4">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {video.series_name && (
                              <SeriesBadge
                                className="min-w-0 max-w-24 shrink"
                                title={video.series_name}
                              >
                                <span className="min-w-0 truncate">
                                  {video.series_name}
                                </span>
                              </SeriesBadge>
                            )}
                            <VideoLink
                              href={`/video/${video.id}`}
                              target="_blank"
                              rel="noreferrer"
                              title={video.title}
                              className="min-w-0 flex-1 truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {video.title}
                            </VideoLink>
                          </div>
                          {tagCount > 0 && (
                            <div className="hidden min-w-0 max-w-1/2 shrink items-center justify-end gap-1 overflow-hidden md:flex">
                              {visibleTags.map((tag, index) => (
                                <TagBadge
                                  key={tag.id}
                                  render={
                                    <Link
                                      href={`/admin/tags/${tag.id}?from=${encodeURIComponent(returnHref)}`}
                                    />
                                  }
                                  source={tag.source}
                                  title={tag.name}
                                  className={cn(
                                    "min-w-0 max-w-24 shrink cursor-pointer",
                                    index === 1 && "hidden lg:inline-flex",
                                    index === 2 && "hidden xl:inline-flex",
                                  )}
                                >
                                  <span className="min-w-0 truncate">
                                    {tag.name}
                                  </span>
                                </TagBadge>
                              ))}
                              {tagCount > 3 && (
                                <Badge
                                  variant="secondary"
                                  title={`另有 ${tagCount - 3} 个标签`}
                                  className="hidden shrink-0 xl:inline-flex"
                                >
                                  +{tagCount - 3}
                                </Badge>
                              )}
                              {tagCount > 2 && (
                                <Badge
                                  variant="secondary"
                                  title={`另有 ${tagCount - 2} 个标签`}
                                  className="hidden shrink-0 lg:inline-flex xl:hidden"
                                >
                                  +{tagCount - 2}
                                </Badge>
                              )}
                              {tagCount > 1 && (
                                <Badge
                                  variant="secondary"
                                  title={`另有 ${tagCount - 1} 个标签`}
                                  className="shrink-0 lg:hidden"
                                >
                                  +{tagCount - 1}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">
                          {videoResolution(video)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground tabular-nums lg:table-cell">
                    {video.clicks.toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground tabular-nums lg:table-cell">
                    {video.views.toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground tabular-nums sm:table-cell">
                    {formatSize(video.size_bytes)}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    <LocalTime value={video.mtime} />
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background text-right transition-colors group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-data-[state=selected]:bg-muted">
                    <VideoRowActions
                      video={video}
                      onChanged={onChanged}
                      onDeleted={onDeleted}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function VideoManagerContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [sort, setSort] = useState(() => searchParams.get("sort") ?? "newest");
  const [filterTagIds, setFilterTagIds] = useState<number[]>(() =>
    (searchParams.get("tags") ?? "")
      .split(",")
      .map(Number)
      .filter(Number.isInteger),
  );
  const [filterTags, setFilterTags] = useState<TagOption[]>([]);
  const [filterTagsHydrated, setFilterTagsHydrated] = useState(
    () => filterTagIds.length === 0,
  );
  const [page, setPage] = useState(() => {
    const value = Number(searchParams.get("page"));
    return Number.isInteger(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize"));
    return MANAGER_PAGE_SIZES.some((size) => size === value)
      ? value
      : MANAGER_PAGE_SIZES[0];
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [liveRefreshEpoch, setLiveRefreshEpoch] = useState(0);
  const requestKey = JSON.stringify([
    debouncedQuery,
    sort,
    page,
    pageSize,
    filterTagIds,
    refreshEpoch,
  ]);
  const [loadedRequest, setLoadedRequest] = useState("");
  const loading = loadedRequest !== requestKey;

  useEffect(() => {
    if (filterTagsHydrated) return;
    const controller = new AbortController();
    fetch("/api/tags", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "无法加载标签筛选");
        const selectedIds = new Set(filterTagIds);
        const resolved = (data.tags as TagOption[]).filter(
          (tag) => tag.id !== undefined && selectedIds.has(tag.id),
        );
        setFilterTags(resolved);
        setFilterTagIds(
          resolved.flatMap((tag) => (tag.id === undefined ? [] : [tag.id])),
        );
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError") {
          toast.error((cause as Error).message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setFilterTagsHydrated(true);
      });
    return () => controller.abort();
  }, [filterTagIds, filterTagsHydrated]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
      setSelected(new Set());
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      sort,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (filterTagIds.length > 0) params.set("tags", filterTagIds.join(","));

    fetch(`/api/videos?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "加载失败");
        if (data.videos.length === 0 && data.total > 0 && page > 1) {
          setTotal(data.total);
          setPage(Math.max(1, Math.ceil(data.total / pageSize)));
          return;
        }
        setVideos(data.videos as Video[]);
        setTotal(data.total);
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError")
          toast.error((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedRequest(requestKey);
      });

    return () => controller.abort();
  }, [
    debouncedQuery,
    filterTagIds,
    page,
    pageSize,
    refreshEpoch,
    requestKey,
    sort,
    liveRefreshEpoch,
  ]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        setLiveRefreshEpoch((epoch) => epoch + 1);
      }, 200);
    };
    const source = new EventSource("/api/videos/stream");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as VideoEvent;
      if (event.type === "invalidate") {
        scheduleRefresh();
        return;
      }

      setVideos((current) =>
        current.map((video) =>
          video.id === event.videoId
            ? {
                ...video,
                ...(event.clicks === undefined ? {} : { clicks: event.clicks }),
                ...(event.views === undefined ? {} : { views: event.views }),
              }
            : video,
        ),
      );
      if (
        (event.clicks !== undefined && sort.startsWith("clicks_")) ||
        (event.views !== undefined && sort.startsWith("views_"))
      ) {
        scheduleRefresh();
      }
    };

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      source.close();
    };
  }, [sort]);

  useEffect(() => {
    router.replace(
      videoManagerHref({
        pathname,
        query: debouncedQuery,
        tagIds: filterTagIds,
        sort,
        page,
        pageSize,
      }),
      { scroll: false },
    );
  }, [debouncedQuery, filterTagIds, page, pageSize, pathname, router, sort]);

  function addFilterTag(option: TagOption) {
    if (option.id === undefined || filterTagIds.includes(option.id)) return;
    setFilterTags((current) => [...current, option]);
    setFilterTagIds((current) => [...current, option.id!]);
    setPage(1);
    setSelected(new Set());
  }

  function removeFilterTag(id: number) {
    setFilterTags((current) => current.filter((tag) => tag.id !== id));
    setFilterTagIds((current) => current.filter((tagId) => tagId !== id));
    setPage(1);
    setSelected(new Set());
  }

  function toggleVideo(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(ids: number[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function finishBatch(message: React.ReactNode) {
    toast.success(message);
    setSelected(new Set());
    setRefreshEpoch((epoch) => epoch + 1);
  }

  async function startCatalogScan() {
    if (scanSubmitting) return;
    setScanSubmitting(true);
    try {
      const response = await fetch("/api/videos/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法开始扫描");
      toast.success("视频目录扫描已提交后台处理");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setScanSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const returnHref = videoManagerHref({
    pathname,
    query: debouncedQuery,
    tagIds: filterTagIds,
    sort,
    page,
    pageSize,
  });

  function refreshVideos() {
    setRefreshEpoch((epoch) => epoch + 1);
  }

  function handleDeleted(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    refreshVideos();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="搜索标题、路径、系列、标签或拼音"
          className="min-w-56 flex-1"
        />
        <TagAutocomplete
          endpoint="/api/tags/suggest?limit=30"
          mode="multi"
          placeholder="按标签筛选"
          allowCreate={false}
          disabledNames={filterTags.map((tag) => tag.name)}
          onSelect={(_, option) => addFilterTag(option)}
          className="w-44"
          inputId="video-tag-filter"
        />
        <AutoTagDialog onCommitted={refreshVideos} />
        <Button
          variant="outline"
          disabled={scanSubmitting}
          onClick={startCatalogScan}
        >
          {scanSubmitting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          扫描目录
        </Button>
      </div>

      {filterTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {filterTags.map((tag) => (
            <RemovableTagBadge
              key={tag.id}
              state={tag.reviewState}
              removeLabel={`移除标签筛选"${tag.name}"`}
              title={tag.name}
              className="max-w-40"
              onClick={() => removeFilterTag(tag.id!)}
            >
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            </RemovableTagBadge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterTags([]);
              setFilterTagIds([]);
              setPage(1);
              setSelected(new Set());
            }}
          >
            清除筛选
          </Button>
        </div>
      )}

      <p className="text-xs text-foreground">共 {total} 个视频</p>

      {selected.size > 0 && (
        <div className="sticky top-2 flex flex-wrap items-center gap-2 rounded-lg border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-xl">
          <span className="text-xs">
            已选择 <span className="font-medium">{selected.size}</span> 个视频
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBatchAction("add")}>
              <PlusIcon data-icon="inline-start" />
              添加标签
            </Button>
            <Button variant="outline" onClick={() => setBatchAction("remove")}>
              <TagsIcon data-icon="inline-start" />
              移除标签
            </Button>
            <Button variant="outline" onClick={() => setSeriesDialogOpen(true)}>
              <LibraryIcon data-icon="inline-start" />
              设置系列
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              取消选择
            </Button>
          </div>
        </div>
      )}

      {!loading && videos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>未找到视频</EmptyTitle>
            <EmptyDescription>请调整搜索条件</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <VideoTable
          videos={videos}
          loading={loading}
          selected={selected}
          sort={sort}
          returnHref={returnHref}
          onToggleVideo={toggleVideo}
          onTogglePage={togglePage}
          onChanged={refreshVideos}
          onDeleted={handleDeleted}
          onSort={(nextSort) => {
            setSort(nextSort);
            setPage(1);
          }}
        />
      )}

      {(loading || total > 0) && (
        <ListPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          buttonSize="sm"
          className="gap-3"
          pageSize={{
            value: pageSize,
            options: MANAGER_PAGE_SIZES,
            label: "每页视频",
            onChange: (nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            },
          }}
        />
      )}
      <BatchTagDialog
        action={batchAction ?? "add"}
        count={selected.size}
        open={batchAction !== null}
        onOpenChange={(open) => {
          if (!open) setBatchAction(null);
        }}
        videoIds={[...selected]}
        onApplied={finishBatch}
      />
      <BatchSeriesDialog
        count={selected.size}
        open={seriesDialogOpen}
        onOpenChange={setSeriesDialogOpen}
        videoIds={[...selected]}
        onApplied={finishBatch}
      />
    </>
  );
}

export default function VideoManager() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <VideoManagerContent />
    </Suspense>
  );
}
