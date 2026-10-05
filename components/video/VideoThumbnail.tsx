"use client";

import { useTranslations } from "next-intl";
import { ViewTransition } from "react";
import { FilmIcon } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { morphName, useIsMorphSource } from "@/lib/morph";
import { resolutionLabel } from "@/lib/tagger";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isResumable, useWatchProgress } from "@/lib/watchProgress";
import { useVideoPreview } from "./useVideoPreview";

/**
 * A thumbnail that plays a muted preview on hover and shows how much of the
 * video the viewer has watched. `morphKey` names this instance, so it alone
 * morphs into the player when it is the one opened.
 */
export default function VideoThumbnail({
  video,
  morphKey,
  preview = true,
  eager = false,
  className,
}: {
  video: VideoCardData;
  morphKey: string;
  preview?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const common = useTranslations("Common");
  const morph = useIsMorphSource(morphKey);
  const progress = useWatchProgress()[video.id];
  const { active, ready, position, scrubbing, handlers, videoProps } =
    useVideoPreview({
      id: video.id,
      ext: video.ext,
      duration: video.duration_sec,
    });
  const resolution = resolutionLabel(video.width, video.height)?.replace(
    "4k",
    "4K",
  );
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
        "relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5 transition-[border-radius,box-shadow] duration-300 group-hover/card:shadow-lg group-hover/card:shadow-black/10",
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
          "pointer-events-none absolute right-1.5 bottom-1.5 flex gap-1 transition-opacity duration-200",
          ready && !scrubbing && "opacity-0",
        )}
      >
        {resolution && resolution !== "sd" && (
          <span className="rounded bg-black/70 px-1 py-0.5 text-xs/none font-semibold text-white backdrop-blur-sm">
            {resolution}
          </span>
        )}
        <span className="rounded bg-black/70 px-1 py-0.5 text-xs/none font-medium text-white tabular-nums backdrop-blur-sm">
          {scrubbing && video.duration_sec
            ? formatDuration(position * video.duration_sec)
            : formatDuration(video.duration_sec)}
        </span>
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
