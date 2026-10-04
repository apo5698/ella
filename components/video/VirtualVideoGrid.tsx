"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { VideoCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import VideoCard from "./VideoCard";

const GAP_X = 16;
const GAP_Y = 32;
/** Title (two lines) and the facts line under the thumbnail. */
const TEXT_HEIGHT = 74;

function columnsFor(width: number) {
  if (width < 480) return 1;
  if (width < 780) return 2;
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
  const restored = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      setWidth(element.clientWidth);
      setOffset(element.getBoundingClientRect().top + window.scrollY);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const columns = columnsFor(width);
  const cardWidth = (width - GAP_X * (columns - 1)) / columns;
  const rowHeight = (cardWidth * 9) / 16 + TEXT_HEIGHT + GAP_Y;
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
            columnGap: GAP_X,
            paddingBottom: GAP_Y,
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
