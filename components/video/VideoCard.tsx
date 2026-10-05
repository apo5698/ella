"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import { setMorphSource } from "@/lib/morph";
import type { VideoCardData } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";
import VideoThumbnail from "./VideoThumbnail";

/**
 * One video in a grid or a shelf: the thumbnail carries the eye and the
 * numbers, and the text under it stays to a title and the series and date.
 */
export default function VideoCard({
  video,
  morphKey,
  layout = "vertical",
  autoplay,
  eager,
  onOpen,
  className,
  style,
}: {
  video: VideoCardData;
  /** Unique on the page, see VideoThumbnail. */
  morphKey: string;
  layout?: "vertical" | "compact";
  /** Play the preview without a mouse, see useVideoPreview. */
  autoplay?: boolean;
  eager?: boolean;
  /** Called before the video opens, for example to record a scroll offset. */
  onOpen?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("VideoCard");
  const locale = useLocale();
  const now = useNow();
  const href = `/video/${video.id}`;
  const open = () => {
    onOpen?.();
    setMorphSource(morphKey);
  };
  const compact = layout === "compact";

  return (
    <article
      className={cn(
        "group/card relative flex min-w-0",
        compact ? "flex-row gap-2.5" : "flex-col gap-2.5",
        className,
      )}
      style={style}
    >
      <Link
        href={href}
        onClick={open}
        tabIndex={-1}
        aria-hidden
        className={cn("block shrink-0", compact && "w-40 sm:w-44")}
      >
        <VideoThumbnail
          video={video}
          morphKey={morphKey}
          autoplay={autoplay}
          eager={eager}
          className={compact ? "rounded-lg" : undefined}
        />
      </Link>
      <div className={cn("flex min-w-0 flex-col gap-1", !compact && "px-0.5")}>
        <Link
          href={href}
          onClick={open}
          title={video.title}
          className={cn(
            "line-clamp-2 font-medium break-all text-foreground outline-none focus-visible:underline",
            compact
              ? "text-sm leading-snug"
              : "text-sm leading-snug sm:text-[15px]",
          )}
        >
          {video.title}
        </Link>
        <div className="flex min-w-0 items-center gap-x-1 text-xs text-muted-foreground">
          {video.series_id !== null && video.series_name && (
            <>
              <Link
                href={`/?series=${video.series_id}`}
                className="min-w-0 truncate hover:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                {video.series_name}
              </Link>
              <span aria-hidden className="shrink-0">
                ·
              </span>
            </>
          )}
          <span className="sr-only">{t("views", { count: video.views })}</span>
          <time
            dateTime={new Date(video.mtime).toISOString()}
            suppressHydrationWarning
            className="shrink-0"
          >
            {relativeTime(video.mtime, now, locale)}
          </time>
        </div>
      </div>
    </article>
  );
}
