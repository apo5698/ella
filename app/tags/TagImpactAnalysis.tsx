"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VideoLink from "@/components/VideoLink";
import { InlineTagBadge, TagBadge } from "@/components/tags/TagBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { formatTagImpactFact } from "@/lib/tagImpactMessages";
import { cn } from "@/lib/utils";
import type { TagImpact, TagImpactFact } from "@/lib/tagImpact";
import type { TagReviewState } from "@/lib/types";

/** How long the request waits while a name is still being typed. */
const DEBOUNCE_MS = 250;
const VIDEO_PREVIEW_LIMIT = 10;

export type TagImpactRequest =
  | {
      action: "state";
      id: number;
      state: Exclude<TagReviewState, "automatic">;
    }
  | { action: "categorize"; id: number }
  | { action: "delete"; ids: number[] }
  | { action: "exclude"; ids: number[] }
  | { action: "restore"; ids: number[] }
  /** `parentName` stands in when the parent has not been created yet. */
  | {
      action: "move";
      ids: number[];
      parentId: number | null;
      parentName?: string;
    }
  | { action: "merge"; sourceIds: number[]; targetId: number }
  | { action: "rename"; id: number; name: string };

function affectedTagIds(request: TagImpactRequest): number[] {
  switch (request.action) {
    case "state":
      return [request.id];
    case "categorize":
      return [request.id];
    case "delete":
    case "exclude":
    case "restore":
    case "move":
      return request.ids;
    case "merge":
      return request.sourceIds;
    case "rename":
      return [request.id];
  }
}

function AffectedVideosDialog({
  label,
  videos,
}: {
  label: string;
  videos: TagImpact["videos"];
}) {
  if (videos.length === 0) return <span>{label}</span>;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="cursor-pointer font-medium underline decoration-dotted underline-offset-2"
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="flex h-5/6 min-w-0 flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>直接使用该标签的视频</DialogTitle>
          <DialogDescription>共 {videos.length} 个视频</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden pr-3 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
          <ItemGroup className="min-w-0">
            {videos.map((video) => (
              <div key={video.id} role="listitem">
                <Item
                  variant="outline"
                  size="sm"
                  className="min-w-0 overflow-hidden"
                  render={
                    <VideoLink
                      href={`/video/${video.id}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  {video.thumbnail && (
                    <ItemMedia variant="image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={video.thumbnail} alt="" loading="lazy" />
                    </ItemMedia>
                  )}
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full max-w-full truncate">
                      {video.title}
                    </ItemTitle>
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ImpactFactMessage({
  fact,
  videos,
}: {
  fact: TagImpactFact;
  videos: TagImpact["videos"];
}) {
  const message = formatTagImpactFact(fact);

  return (
    <li className={cn(message.tone === "destructive" && "text-destructive")}>
      {message.segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : segment.kind === "tag" ? (
          <InlineTagBadge key={index} state={segment.tag.reviewState}>
            {segment.tag.name}
          </InlineTagBadge>
        ) : segment.kind === "video-count" ? (
          <AffectedVideosDialog
            key={index}
            label={segment.text}
            videos={videos.filter((video) =>
              segment.videoIds.includes(video.id),
            )}
          />
        ) : (
          <HoverCard key={index}>
            <HoverCardTrigger
              delay={100}
              closeDelay={200}
              render={
                <button
                  type="button"
                  className="cursor-help font-medium text-foreground underline decoration-dotted underline-offset-2"
                />
              }
            >
              {segment.text}
            </HoverCardTrigger>
            <HoverCardContent align="start">
              <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
                {segment.items.map((tag) => (
                  <TagBadge key={tag.id} state={tag.reviewState}>
                    {tag.name}
                  </TagBadge>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        ),
      )}
    </li>
  );
}

/**
 * What an operation is about to do, shown before it is confirmed.
 *
 * Every consequence is stated in videos rather than in tags, because a tag is
 * only ever a means of finding one. Callers render this only once there is
 * something to describe, so `request` is always a real operation.
 */
export default function TagImpactAnalysis({
  request,
  className,
  showVideos = true,
}: {
  request: TagImpactRequest;
  className?: string;
  showVideos?: boolean;
}) {
  const [impact, setImpact] = useState<TagImpact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/tags/impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        setImpact(res.ok ? await res.json() : null);
      } catch {
        // Aborted by the next keystroke, or offline. The previous answer
        // stays on screen rather than the analysis emptying out.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The request is rebuilt on every render, so its contents are the dependency.
  }, [JSON.stringify(request)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FieldGroup className={cn("min-h-0 min-w-0 flex-1", className)}>
      <Field className="min-h-0 min-w-0 flex-1">
        <FieldLabel>
          影响分析
          {loading && <Spinner />}
        </FieldLabel>

        {impact && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <ul className="flex shrink-0 list-disc flex-col gap-1 pl-4 text-xs/relaxed text-foreground">
              {impact.facts.map((fact, index) => (
                <ImpactFactMessage
                  key={`${fact.kind}-${index}`}
                  fact={fact}
                  videos={impact.videos}
                />
              ))}
            </ul>

            {showVideos && impact.videos.length > 0 && (
              // Takes the room left over once the notes above have theirs, and
              // scrolls within it. Wrapping rather than one long row, which a
              // wheel cannot reach.
              <div className="min-h-0 flex-1 scroll-fade overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-4 gap-2">
                  {impact.videos.slice(0, VIDEO_PREVIEW_LIMIT).map((video) => (
                    // A new tab rather than this one: the dialog holds a decision
                    // that is not finished being made.
                    <VideoLink
                      key={video.id}
                      href={`/video/${video.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title={video.title}
                      className="group min-w-0"
                    >
                      <div className="aspect-video overflow-hidden rounded bg-muted ring-offset-background transition group-hover:ring-2 group-hover:ring-ring">
                        {video.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnail}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <div className="mt-1 truncate text-muted-foreground group-hover:text-foreground">
                        {video.title}
                      </div>
                    </VideoLink>
                  ))}
                </div>
                {impact.videos.length > VIDEO_PREVIEW_LIMIT && (
                  <FieldDescription>
                    <Link
                      href={{
                        pathname: "/",
                        query: { tags: affectedTagIds(request).join(",") },
                      }}
                      className="text-link hover:underline"
                      target="_blank"
                    >
                      显示所有视频（{impact.total}）
                    </Link>
                  </FieldDescription>
                )}
              </div>
            )}
          </div>
        )}
      </Field>
    </FieldGroup>
  );
}
