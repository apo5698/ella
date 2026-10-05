"use client";

import { useLocale, useTranslations } from "next-intl";
import { ViewTransition } from "react";
import { FilmIcon, PlayIcon } from "lucide-react";
import { formatCount, formatDuration } from "@/lib/format";
import { morphName, useIsMorphSource } from "@/lib/morph";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isResumable, useWatchProgress } from "@/lib/watchProgress";
import { useVideoPreview } from "./useVideoPreview";
import VideoResolutionBadge from "./VideoResolutionBadge";

/**
 * A thumbnail that plays a muted preview on hover and shows how much of the
 * video the viewer has watched. The play count and the length sit on the
 * picture, as on Bilibili, so the card below it stays short. `morphKey` names this instance, so it alone
 * morphs into the player when it is the one opened.
 */
export default function VideoThumbnail({
  video,
  morphKey,
  preview = true,
  autoplay = false,
  eager = false,
  className,
}: {
  video: VideoCardData;
  morphKey: string;
  preview?: boolean;
  /** Play the preview without a mouse, see useVideoPreview. */
  autoplay?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const common = useTranslations("Common");
  const locale = useLocale();
  const morph = useIsMorphSource(morphKey);
  const progress = useWatchProgress()[video.id];
  const { active, ready, position, scrubbing, handlers, videoProps } =
    useVideoPreview({
      id: video.id,
      ext: video.ext,
      duration: video.duration_sec,
      points: video.preview_points,
      clip: video.preview_clip,
      autoplay: preview && autoplay,
    });
  const watched = isResumable(progress)
    ? progress.time / progress.duration
    : null;

  const image = video.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={video.thumbnail}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn(
        "size-full object-cover transition-[scale,opacity] duration-500 ease-out motion-safe:group-hover/card:scale-[1.03]",
        ready && "opacity-0",
      )}
    />
  ) : (
    <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
      <FilmIcon className="size-5" />
      {common("noThumbnail")}
    </div>
  );

  return (
    <div
      className={cn(
        "@container relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5 transition-[border-radius,box-shadow] duration-300 group-hover/card:shadow-lg group-hover/card:shadow-black/10",
        ready && "rounded-md",
        className,
      )}
      {...(preview ? handlers : {})}
    >
      {morph ? (
        <ViewTransition name={morphName(video.id)} share="morph" default="none">
          {image}
        </ViewTransition>
      ) : (
        image
      )}

      {preview && active && (
        <video
          {...videoProps}
          className={cn(
            "absolute inset-0 size-full bg-black object-contain opacity-0 transition-opacity duration-300",
            ready && "opacity-100",
          )}
        />
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 text-white transition-opacity duration-200",
          ready && !scrubbing && "opacity-0",
        )}
      >
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/70 to-transparent" />
        <VideoResolutionBadge
          width={video.width}
          height={video.height}
          className="absolute top-1.5 right-1.5 @max-3xs:top-1 @max-3xs:right-1 @max-3xs:text-[0.625rem]/none"
        />
        <div
          className={cn(
            "absolute inset-x-2 flex items-center justify-between gap-2 text-xs/none [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]",
            watched !== null && !ready ? "bottom-2.5" : "bottom-1.5",
          )}
        >
          <span className="flex min-w-0 items-center gap-1 tabular-nums">
            <PlayIcon className="size-3 shrink-0 fill-current" />
            {formatCount(video.views, locale)}
          </span>
          <span className="tabular-nums">
            {scrubbing && video.duration_sec
              ? formatDuration(position * video.duration_sec)
              : formatDuration(video.duration_sec)}
          </span>
        </div>
      </div>

      {ready ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
          <div
            className="h-full bg-primary"
            style={{ width: `${position * 100}%` }}
          />
        </div>
      ) : (
        watched !== null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/30">
            <div
              className="h-full bg-primary"
              style={{ width: `${watched * 100}%` }}
            />
          </div>
        )
      )}
    </div>
  );
}
