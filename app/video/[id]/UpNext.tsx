"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import VideoCard from "@/components/video/VideoCard";
import { Switch } from "@/components/ui/switch";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setAutoplay, useAutoplay } from "./useAutoplay";

/**
 * The column beside the player: the rest of the series in order, then
 * videos that share the most tags with this one.
 */
export default function UpNext({
  currentId,
  seriesName,
  series,
  related,
}: {
  currentId: number;
  seriesName: string | null;
  series: VideoCardData[];
  related: VideoCardData[];
}) {
  const t = useTranslations("Watch");
  const autoplay = useAutoplay();
  const list = useRef<HTMLOListElement>(null);
  const current = useRef<HTMLLIElement>(null);
  const position = series.findIndex((video) => video.id === currentId);

  // Centres the current episode in a long series list. Only the list
  // scrolls: scrollIntoView would move the page too on a phone.
  useEffect(() => {
    const container = list.current;
    const item = current.current;
    if (!container || !item) return;
    container.scrollTop =
      item.offsetTop - container.offsetTop - container.clientHeight / 2;
  }, [currentId]);

  return (
    <aside className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("upNext")}</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("autoplay")}
          <Switch checked={autoplay} onCheckedChange={setAutoplay} />
        </label>
      </div>

      {series.length > 1 && (
        <section className="flex flex-col gap-3 rounded-xl border bg-card/50 p-3">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h3 className="truncate text-sm font-semibold">{seriesName}</h3>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {position >= 0
                ? `${position + 1} / ${series.length}`
                : series.length}
            </span>
          </div>
          <ol
            ref={list}
            className="flex max-h-96 flex-col gap-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          >
            {series.map((video, index) => {
              const playing = video.id === currentId;
              return (
                <li
                  key={video.id}
                  ref={playing ? current : undefined}
                  aria-current={playing || undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg p-1 transition-colors",
                    playing ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                    {playing ? "▶" : index + 1}
                  </span>
                  <VideoCard
                    video={video}
                    morphKey={`series-${video.id}`}
                    layout="compact"
                    className="flex-1"
                  />
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {series.length > 1 && (
          <h3 className="text-sm font-semibold">{t("related")}</h3>
        )}
        <ul className="flex flex-col gap-3">
          {related.map((video, index) => (
            <li
              key={video.id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:fill-mode-both motion-safe:duration-500"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <VideoCard
                video={video}
                morphKey={`related-${video.id}`}
                layout="compact"
              />
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

/** The video that autoplay starts after this one. */
export function nextVideo(
  currentId: number,
  series: VideoCardData[],
  related: VideoCardData[],
) {
  const index = series.findIndex((video) => video.id === currentId);
  if (index >= 0 && index < series.length - 1) return series[index + 1];
  return related[0] ?? null;
}
