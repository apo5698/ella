"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Unlink } from "lucide-react";
import { toast } from "sonner";
import ListPagination from "@/components/ListPagination";
import SearchInput from "@/components/SearchInput";
import VideoListItem from "@/components/admin/VideoListItem";
import { InlineTagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { MANAGER_PAGE_SIZES } from "@/lib/pagination";
import type { TagReviewState, Video } from "@/lib/types";

export default function TagVideoList({
  tagId,
  tagName,
  tagState,
  initialTotal,
}: {
  tagId: number;
  tagName: string;
  tagState: TagReviewState;
  initialTotal: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("videoQ") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [page, setPage] = useState(() => {
    const value = Number(searchParams.get("videoPage"));
    return Number.isInteger(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("videoPageSize"));
    return MANAGER_PAGE_SIZES.some((size) => size === value)
      ? value
      : MANAGER_PAGE_SIZES[0];
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(initialTotal);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadedRequest, setLoadedRequest] = useState("");
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const requestKey = JSON.stringify([
    tagId,
    debouncedQuery,
    page,
    pageSize,
    refreshEpoch,
  ]);
  const loading = requestKey !== loadedRequest;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      tags: String(tagId),
      tagMode: "direct",
      sort: "views",
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedQuery) params.set("q", debouncedQuery);

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
  }, [debouncedQuery, page, pageSize, refreshEpoch, requestKey, tagId]);

  function updateUrl(
    nextQuery: string,
    nextPage: number,
    nextPageSize: number,
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery) params.set("videoQ", nextQuery);
    else params.delete("videoQ");
    if (nextPage > 1) params.set("videoPage", String(nextPage));
    else params.delete("videoPage");
    if (nextPageSize !== MANAGER_PAGE_SIZES[0])
      params.set("videoPageSize", String(nextPageSize));
    else params.delete("videoPageSize");
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, {
      scroll: false,
    });
  }

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
    setSelected(new Set());
    updateUrl(value, 1, pageSize);
  }

  function changePage(value: number) {
    setPage(value);
    setSelected(new Set());
    updateUrl(query, value, pageSize);
  }

  function changePageSize(value: number) {
    setPageSize(value);
    setPage(1);
    setSelected(new Set());
    updateUrl(query, 1, value);
  }

  const currentIds = useMemo(() => videos.map((video) => video.id), [videos]);
  const allSelected =
    currentIds.length > 0 && currentIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && currentIds.some((id) => selected.has(id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function togglePage() {
    setSelected(allSelected ? new Set() : new Set(currentIds));
  }

  async function removeSelected() {
    const response = await fetch("/api/videos/batch/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        ids: [...selected],
        names: [tagName],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "移除失败，请重试");
      return;
    }
    toast.success(
      <>
        已从 {selected.size} 个视频移除
        <InlineTagBadge state={tagState}>{tagName}</InlineTagBadge>
      </>,
    );
    setSelected(new Set());
    setRefreshEpoch((value) => value + 1);
    router.refresh();
  }

  const pagination = (
    <ListPagination
      page={page}
      totalPages={totalPages}
      onPageChange={changePage}
      buttonSize="sm"
      pageSize={{
        value: pageSize,
        options: MANAGER_PAGE_SIZES,
        label: "每页视频",
        onChange: changePageSize,
      }}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>视频（{total}）</CardTitle>
        <CardDescription>直接使用该标签的视频</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            disabled={selected.size === 0}
            onClick={removeSelected}
          >
            <Unlink data-icon="inline-start" />
            从所选视频移除
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SearchInput
          value={query}
          onValueChange={changeQuery}
          placeholder="搜索这些视频"
        />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={togglePage}
            aria-label="全选当前页"
          />
          <button type="button" className="cursor-pointer" onClick={togglePage}>
            全选当前页
          </button>
          <div className="ml-auto">{pagination}</div>
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
        ) : videos.length === 0 ? (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyTitle>没有视频</EmptyTitle>
              <EmptyDescription>
                {query ? "没有匹配的视频" : "没有视频直接使用该标签"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {videos.map((video) => (
              <VideoListItem
                key={video.id}
                video={video}
                checked={selected.has(video.id)}
                onCheckedChange={(checked) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked) next.add(video.id);
                    else next.delete(video.id);
                    return next;
                  });
                }}
              />
            ))}
          </ItemGroup>
        )}

        {pagination}
      </CardContent>
    </Card>
  );
}
