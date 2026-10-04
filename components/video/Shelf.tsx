"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "./useScrollEdges";
import VideoCard from "./VideoCard";

/**
 * A titled row that scrolls sideways. Arrows page through it with a mouse;
 * touch scrolls it directly and snaps to a card.
 */
export default function Shelf({
  id,
  title,
  href,
  videos,
  index = 0,
}: {
  id: string;
  title: string;
  /** Where "View all" leads. */
  href?: string;
  videos: VideoCardData[];
  /** Place on the page, to stagger the entrance. */
  index?: number;
}) {
  const t = useTranslations("Discover");
  const {
    ref: scroller,
    edges,
    measure,
    page,
  } = useScrollEdges<HTMLDivElement>(videos.length);

  const headingId = `shelf-${id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="group/shelf flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-700"
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
    >
      <div className="flex items-end justify-between gap-4">
        <h2 id={headingId} className="truncate text-lg font-semibold">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {href && (
            <Link
              href={href}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t("viewAll")}
            </Link>
          )}
          <div className="hidden gap-1 pointer-fine:flex">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("scrollBack")}
              disabled={edges.start}
              onClick={() => page(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("scrollForward")}
              disabled={edges.end}
              onClick={() => page(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>
      <div className="relative -mx-4 sm:-mx-6">
        <div
          ref={scroller}
          onScroll={measure}
          className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {videos.map((video, position) => (
            <VideoCard
              key={video.id}
              video={video}
              morphKey={`${id}-${video.id}`}
              eager={index < 2 && position < 5}
              className="w-[72vw] shrink-0 snap-start sm:w-64 lg:w-72"
            />
          ))}
        </div>
        {/* Fades hint that the row continues past the edge. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-background to-transparent transition-opacity sm:w-10",
            edges.start && "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-background to-transparent transition-opacity sm:w-10",
            edges.end && "opacity-0",
          )}
        />
      </div>
    </section>
  );
}
