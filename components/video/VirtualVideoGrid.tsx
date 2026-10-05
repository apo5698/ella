"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type GridLayout, useGridLayout } from "./useGridLayout";
import VideoCard from "./VideoCard";

/** Below this width the viewer chooses one column or two. */
const NARROW = 780;
/** Below this width two columns sit closer together. */
const PHONE = 480;
/** Where the card in focus sits in a one-column feed, from the top. */
const FOCUS_LINE = 0.4;
/** Title (two lines) and the facts line under the thumbnail. */
const TEXT_HEIGHT = 74;

function columnsFor(width: number, layout: GridLayout) {
  if (width < NARROW) return layout === "single" ? 1 : 2;
  if (width < 1080) return 3;
  if (width < 1480) return 4;
  return 5;
}

/**
 * A grid that renders only the rows near the screen, so a library of any size
 * scrolls as smoothly as a page of it. Asks for more as the end comes near.
 */
export default function VirtualVideoGrid({
  videos,
  fresh,
  hasMore,
  onEndReached,
  onOpen,
  restoreY,
}: {
  videos: VideoCardData[];
  /** Ids of the latest batch, which fade in as they arrive. */
  fresh: Set<number>;
  hasMore: boolean;
  onEndReached: () => void;
  onOpen?: () => void;
  /** A scroll offset to return to once the rows are laid out. */
  restoreY?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const restored = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      setWidth(element.clientWidth);
      setOffset(element.getBoundingClientRect().top + window.scrollY);
      setViewport(window.innerHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(document.body);
    // The window can change height alone, as a phone's address bar hides.
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const layout = useGridLayout();
  const columns = columnsFor(width, layout);
  const tight = width < PHONE && columns > 1;
  const gapX = tight ? 10 : 16;
  const gapY = tight ? 20 : 32;
  const cardWidth = (width - gapX * (columns - 1)) / columns;
  const rowHeight = (cardWidth * 9) / 16 + TEXT_HEIGHT + gapY;
  const rows = Math.ceil(videos.length / columns);

  const virtualizer = useWindowVirtualizer({
    count: width ? rows : 0,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: offset,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  const items = virtualizer.getVirtualItems();
  // One column reads as a feed: the card across the focus line plays, as on
  // YouTube and Bilibili. Two or more columns stay still.
  const focusY = (virtualizer.scrollOffset ?? 0) + viewport * FOCUS_LINE;
  const focusRow =
    columns === 1 && viewport
      ? items.find((row) => row.start <= focusY && focusY < row.end)?.index
      : undefined;
  const lastIndex = items.at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasMore && rows > 0 && lastIndex >= rows - 3) onEndReached();
  }, [hasMore, lastIndex, rows, onEndReached]);

  useLayoutEffect(() => {
    if (restored.current || !restoreY || !width || rows === 0) return;
    restored.current = true;
    window.scrollTo(0, restoreY);
  }, [restoreY, width, rows]);

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {items.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 grid w-full"
          style={{
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            columnGap: gapX,
            paddingBottom: gapY,
          }}
        >
          {videos
            .slice(row.index * columns, (row.index + 1) * columns)
            .map((video, column) => (
              <VideoCard
                key={video.id}
                video={video}
                morphKey={`grid-${video.id}`}
                eager={row.index < 2}
                autoplay={row.index === focusRow}
                onOpen={onOpen}
                className={cn(
                  fresh.has(video.id) &&
                    "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-500",
                )}
                style={
                  fresh.has(video.id)
                    ? { animationDelay: `${column * 50}ms` }
                    : undefined
                }
              />
            ))}
        </div>
      ))}
    </div>
  );
}
