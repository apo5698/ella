"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import type { VideoDetailTag, VideoTagState } from "@/lib/types";
import TagList from "./TagList";
import VideoPlayer from "./VideoPlayer";

export default function VideoDetail({
  video,
  thumbnail,
  tags,
  seriesName,
  initialViews,
  playerMeta,
}: {
  video: { id: number; title: string };
  thumbnail: string | null;
  tags: VideoDetailTag[];
  seriesName: string | null;
  initialViews: number;
  playerMeta: { duration: string; resolution: string | null; size: string };
}) {
  const t = useTranslations("VideoActions");
  const { notifications } = useTaskQueue();
  const mountedAt = useRef(0);
  const syncedTask = useRef<number | null>(null);
  const countedClickFor = useRef<number | null>(null);
  const [tagState, setTagState] = useState<VideoTagState>({
    tags,
    rejectedTags: [],
    seriesName,
  });

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (countedClickFor.current === video.id) return;
    countedClickFor.current = video.id;
    void fetch(`/api/videos/${video.id}/click`, { method: "POST" }).catch(
      () => {
        // A failed analytics write must not interrupt opening the video.
      },
    );
  }, [video.id]);

  useEffect(() => {
    const completed = notifications.find((notification) => {
      if (
        notification.type !== "VIDEO_RETAG" ||
        notification.createdAt < mountedAt.current ||
        notification.id === syncedTask.current
      ) {
        return false;
      }
      return Number(notification.payload.videoId) === video.id;
    });
    if (!completed) return;

    syncedTask.current = completed.id;
    const controller = new AbortController();
    void fetch(`/api/videos/${video.id}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to refresh tags");
        return response.json() as Promise<{ tagState?: VideoTagState }>;
      })
      .then((result) => {
        if (result.tagState) setTagState(result.tagState);
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError") {
          console.error("[video] Unable to synchronize tagging results", cause);
        }
      });
    return () => controller.abort();
  }, [notifications, video.id]);

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-2 mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-all text-2xl font-semibold">{video.title}</h1>
          <p className="text-xs text-muted-foreground">id={video.id}</p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          render={<Link href={`/admin/videos/${video.id}`} />}
          nativeButton={false}
        >
          <PencilIcon data-icon="inline-start" />
          {t("edit")}
        </Button>
      </div>

      <VideoPlayer
        videoId={video.id}
        src={`/api/stream/${video.id}`}
        poster={thumbnail ?? undefined}
        initialViews={initialViews}
        meta={playerMeta}
      />

      <TagList series={tagState.seriesName} tags={tagState.tags} />
    </div>
  );
}
