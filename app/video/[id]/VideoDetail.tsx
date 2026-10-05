"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { relativeTime } from "@/lib/format";
import type { Heat } from "@/lib/heat";
import type { VideoCardData, VideoDetailTag, VideoTagState } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import AutoplayOverlay from "./AutoplayOverlay";
import TagList from "./TagList";
import UpNext, { nextVideo } from "./UpNext";
import { handOffPlayback, useAutoplay } from "./useAutoplay";
import VideoPlayer from "./VideoPlayer";

export default function VideoDetail({
  video,
  thumbnail,
  tags,
  seriesName,
  initialViews,
  playerMeta,
  heat,
  series,
  related,
}: {
  video: { id: number; title: string; mtime: number; seriesId: number | null };
  thumbnail: string | null;
  tags: VideoDetailTag[];
  seriesName: string | null;
  initialViews: number;
  playerMeta: { duration: string; resolution: string | null; size: string };
  heat: Heat;
  series: VideoCardData[];
  related: VideoCardData[];
}) {
  const t = useTranslations("VideoActions");
  const watch = useTranslations("Watch");
  const card = useTranslations("VideoCard");
  const locale = useLocale();
  const now = useNow();
  const router = useRouter();
  const autoplay = useAutoplay();
  const [views, setViews] = useState(initialViews);
  const [ended, setEnded] = useState(false);
  const next = nextVideo(video.id, series, related);
  const playNext = useCallback(() => {
    if (!next) return;
    handOffPlayback(next.id);
    router.push(`/video/${next.id}`);
  }, [next, router]);
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

  const facts = [
    card("views", { count: views }),
    playerMeta.duration,
    playerMeta.resolution,
    playerMeta.size,
  ].filter(Boolean);

  return (
    <div className="grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="relative isolate">
          {/* Ambient light: the thumbnail, blurred, glows around the player. */}
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 size-full scale-105 object-cover opacity-30 blur-3xl saturate-150 dark:opacity-50"
            />
          )}
          <VideoPlayer
            videoId={video.id}
            src={`/api/stream/${video.id}`}
            poster={thumbnail ?? undefined}
            initialViews={initialViews}
            meta={playerMeta}
            heat={heat}
            showMeta={false}
            morph
            onViewsChange={setViews}
            onEnded={() => setEnded(true)}
          >
            {ended && autoplay && next && (
              <AutoplayOverlay
                next={next}
                onPlay={playNext}
                onCancel={() => setEnded(false)}
              />
            )}
          </VideoPlayer>
        </div>

        <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <h1 className="text-xl leading-snug font-semibold break-all sm:text-2xl">
            {video.title}
          </h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {video.seriesId !== null && tagState.seriesName && (
                <>
                  <Link
                    href={`/?series=${video.seriesId}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {tagState.seriesName}
                  </Link>
                  <span aria-hidden>·</span>
                </>
              )}
              {facts.map((fact, index) => (
                <span key={index} className="flex items-center gap-2">
                  {index > 0 && <span aria-hidden>·</span>}
                  <span className="tabular-nums">{fact}</span>
                </span>
              ))}
              <span aria-hidden>·</span>
              <span suppressHydrationWarning>
                {watch("added", {
                  time: relativeTime(video.mtime, now, locale) ?? "",
                })}
              </span>
            </p>
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
          <TagList series={null} tags={tagState.tags} />
        </div>
      </div>

      <UpNext
        currentId={video.id}
        seriesName={tagState.seriesName}
        series={series}
        related={related}
      />
    </div>
  );
}
