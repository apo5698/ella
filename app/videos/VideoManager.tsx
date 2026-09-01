"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Library, Plus, RefreshCw, Tags } from "lucide-react";
import { toast } from "sonner";
import TagAutocomplete from "@/components/TagAutocomplete";
import type { Option as TagOption } from "@/components/TagAutocomplete";
import ListPagination from "@/components/ListPagination";
import {
  InlineSeriesBadge,
  RemovableSeriesBadge,
  RemovableTagBadge,
} from "@/components/tags/TagBadge";
import VideoListItem from "@/components/admin/VideoListItem";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MANAGER_PAGE_SIZES } from "@/lib/pagination";
import { compareNames } from "@/lib/tagOrder";
import {
  DEFAULT_SERIES_SORT,
  SERIES_SORT_LABELS,
  SERIES_SORT_OPTIONS,
  VIDEO_SORT_LABELS,
  VIDEO_SORT_OPTIONS,
} from "@/lib/videoSort";
import type { Video } from "@/lib/types";
import AutoTagDialog from "./AutoTagDialog";

type BatchAction = "add" | "remove";
type VideoGroup = {
  id: number | null;
  name: string;
  videoCount: number;
};

function groupValue(group: VideoGroup) {
  return group.id === null ? "none" : String(group.id);
}

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

function GroupVideos({
  group,
  query,
  sort,
  pageSize,
  onPageSizeChange,
  refreshEpoch,
  selected,
  onToggleVideo,
  onTogglePage,
}: {
  group: VideoGroup;
  query: string;
  sort: string;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  refreshEpoch: number;
  selected: Set<number>;
  onToggleVideo: (id: number, checked: boolean) => void;
  onTogglePage: (ids: number[], checked: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(group.videoCount);
  const requestKey = JSON.stringify([
    groupValue(group),
    query,
    sort,
    page,
    pageSize,
    refreshEpoch,
  ]);
  const [loadedRequest, setLoadedRequest] = useState("");
  const loading = loadedRequest !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      series: groupValue(group),
      sort,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (query) params.set("q", query);

    fetch(`/api/videos?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "加载失败");
        setVideos(data.videos);
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
  }, [group, page, pageSize, query, refreshEpoch, requestKey, sort]);

  const currentIds = useMemo(() => videos.map((video) => video.id), [videos]);
  const allSelected =
    currentIds.length > 0 && currentIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && currentIds.some((id) => selected.has(id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginationControls = (
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
          onPageSizeChange(nextPageSize);
          setPage(1);
        },
      }}
    />
  );

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2 text-foreground">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onCheckedChange={() => onTogglePage(currentIds, !allSelected)}
          aria-label={`全选 ${group.name} 当前页`}
        />
        <button
          type="button"
          className="cursor-pointer"
          onClick={() => onTogglePage(currentIds, !allSelected)}
        >
          全选当前页
        </button>
        <div className="ml-auto">{paginationControls}</div>
      </div>

      {loading ? (
        <ItemGroup>
          {Array.from({ length: Math.min(3, pageSize) }, (_, index) => (
            <Item key={index} role="listitem" variant="outline">
              <Skeleton className="size-4" />
              <Skeleton className="h-16 w-28" />
              <ItemContent>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <ItemGroup>
          {videos.map((video) => (
            <VideoListItem
              key={video.id}
              video={video}
              checked={selected.has(video.id)}
              onCheckedChange={(checked) => onToggleVideo(video.id, checked)}
            />
          ))}
        </ItemGroup>
      )}

      {paginationControls}
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
  const [groupSort, setGroupSort] = useState(
    () => searchParams.get("groupSort") ?? DEFAULT_SERIES_SORT,
  );
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize"));
    return MANAGER_PAGE_SIZES.some((size) => size === value)
      ? value
      : MANAGER_PAGE_SIZES[0];
  });
  const [groups, setGroups] = useState<VideoGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const groupRequestKey = JSON.stringify([debouncedQuery, refreshEpoch]);
  const [loadedGroupRequest, setLoadedGroupRequest] = useState("");
  const loading = loadedGroupRequest !== groupRequestKey;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setSelected(new Set());
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ groupBy: "series" });
    if (debouncedQuery) params.set("q", debouncedQuery);

    fetch(`/api/videos?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "加载失败");
        const nextGroups = data.groups as VideoGroup[];
        setGroups(nextGroups);
        setTotal(data.total);
        setOpenGroups((current) => {
          const available = new Set(nextGroups.map(groupValue));
          return current.filter((value) => available.has(value));
        });
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError")
          toast.error((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedGroupRequest(groupRequestKey);
      });

    return () => controller.abort();
  }, [debouncedQuery, groupRequestKey, refreshEpoch]);

  /**
   * Ordered here rather than in SQL: SQLite compares Chinese names by code
   * point, which reads as unsorted. The videos with no series lead in every
   * order, since that group is a gap in the library rather than a series.
   */
  const sortedGroups = useMemo(() => {
    const byName = (a: VideoGroup, b: VideoGroup) =>
      compareNames(a.name, b.name);
    return [...groups].sort((a, b) => {
      if ((a.id === null) !== (b.id === null)) return a.id === null ? -1 : 1;
      if (groupSort === "count_desc") {
        return b.videoCount - a.videoCount || byName(a, b);
      }
      if (groupSort === "count_asc") {
        return a.videoCount - b.videoCount || byName(a, b);
      }
      return byName(a, b);
    });
  }, [groups, groupSort]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (sort !== "newest") params.set("sort", sort);
    if (groupSort !== DEFAULT_SERIES_SORT) params.set("groupSort", groupSort);
    if (pageSize !== MANAGER_PAGE_SIZES[0]) {
      params.set("pageSize", String(pageSize));
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [debouncedQuery, groupSort, pageSize, pathname, router, sort]);

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
      toast.success("视频目录扫描已加入任务队列");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setScanSubmitting(false);
    }
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
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as string)}
        >
          <SelectTrigger aria-label="排序">
            <SelectValue>
              {(value: string) => VIDEO_SORT_LABELS[value] ?? "排序"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {VIDEO_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={groupSort}
          onValueChange={(value) => setGroupSort(value as string)}
        >
          <SelectTrigger aria-label="系列排序">
            <SelectValue>
              {(value: string) => SERIES_SORT_LABELS[value] ?? "系列排序"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SERIES_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <AutoTagDialog
          onCommitted={() => setRefreshEpoch((epoch) => epoch + 1)}
        />
        <Button
          variant="outline"
          disabled={scanSubmitting}
          onClick={startCatalogScan}
        >
          {scanSubmitting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          扫描目录
        </Button>
      </div>

      <p className="text-xs text-foreground">
        共 {total} 个视频，{groups.length} 个分组
      </p>

      {selected.size > 0 && (
        <div className="sticky top-2 flex flex-wrap items-center gap-2 rounded-lg border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-xl">
          <span className="text-xs">
            已选择 <span className="font-medium">{selected.size}</span> 个视频
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBatchAction("add")}>
              <Plus data-icon="inline-start" />
              添加标签
            </Button>
            <Button variant="outline" onClick={() => setBatchAction("remove")}>
              <Tags data-icon="inline-start" />
              移除标签
            </Button>
            <Button variant="outline" onClick={() => setSeriesDialogOpen(true)}>
              <Library data-icon="inline-start" />
              设置系列
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              取消选择
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>未找到视频</EmptyTitle>
            <EmptyDescription>请调整搜索条件</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion
          multiple
          value={openGroups}
          onValueChange={(value) => setOpenGroups(value as string[])}
        >
          {sortedGroups.map((group) => {
            const value = groupValue(group);
            const isOpen = openGroups.includes(value);
            return (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger className="items-center px-3 py-3 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={
                        group.id === null
                          ? "size-2 shrink-0 rounded-full bg-muted-foreground"
                          : "size-2 shrink-0 rounded-full bg-series-border"
                      }
                    />
                    <span className="truncate text-sm">{group.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {group.videoCount}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-1 sm:px-2">
                  {isOpen && (
                    <GroupVideos
                      key={`${value}:${debouncedQuery}:${sort}:${pageSize}:${refreshEpoch}`}
                      group={group}
                      query={debouncedQuery}
                      sort={sort}
                      pageSize={pageSize}
                      onPageSizeChange={setPageSize}
                      refreshEpoch={refreshEpoch}
                      selected={selected}
                      onToggleVideo={toggleVideo}
                      onTogglePage={togglePage}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
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
    <Suspense fallback={null}>
      <VideoManagerContent />
    </Suspense>
  );
}
