"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { isBrowsing, parseHomeFilters } from "@/lib/homeFilters";
import { cn } from "@/lib/utils";
import { useHomeNavigate } from "./useHomeNavigate";
import { useScrollEdges } from "./useScrollEdges";

type Chip = { key: string; label: string; active: boolean; go: () => void };

/**
 * The row of quick filters under the header: the curated page, the whole
 * library, and the most used tags. It stays in view while the page scrolls.
 */
export default function ChipBar({
  tags,
}: {
  tags: { id: number; name: string }[];
}) {
  const t = useTranslations("Discover");
  const params = useSearchParams();
  const navigate = useHomeNavigate();
  const filters = parseHomeFilters(params);
  const browsing = isBrowsing(params);
  const { ref, edges, measure, page } = useScrollEdges<HTMLDivElement>(
    tags.length,
  );

  // Keeps the search and the order, and swaps the tag.
  const withTag = (id: number | null) => {
    const next = new URLSearchParams(params);
    next.delete("view");
    if (id === null) {
      next.delete("tags");
      if (![...next.keys()].length) next.set("view", "all");
    } else next.set("tags", String(id));
    return next;
  };

  const chips: Chip[] = [
    {
      key: "home",
      label: t("forYou"),
      active: !browsing,
      go: () => navigate(new URLSearchParams()),
    },
    {
      key: "all",
      label: t("allVideos"),
      active:
        browsing &&
        !filters.q &&
        filters.tagIds.length === 0 &&
        !filters.series,
      go: () => {
        const next = new URLSearchParams();
        if (params.has("sort")) next.set("sort", filters.sort);
        else next.set("view", "all");
        navigate(next);
      },
    },
    ...tags.map((tag) => {
      const active =
        filters.tagIds.length === 1 && filters.tagIds[0] === tag.id;
      return {
        key: `tag-${tag.id}`,
        label: tag.name,
        active,
        go: () => navigate(withTag(active ? null : tag.id)),
      };
    }),
  ];

  const arrow =
    "absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-foreground/10 transition-opacity hover:bg-muted pointer-fine:flex";

  return (
    <div className="sticky top-[calc(3rem+1px)] z-10 -mx-4 bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          role="toolbar"
          aria-label={t("quickFilters")}
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={chip.active}
              onClick={chip.go}
              className={cn(
                "h-8 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                chip.active
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-foreground/10",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-background via-background/80 to-transparent transition-opacity",
            edges.start && "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-background via-background/80 to-transparent transition-opacity",
            edges.end && "opacity-0",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => page(-1)}
          className={cn(
            arrow,
            "left-0",
            edges.start && "pointer-events-none opacity-0",
          )}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => page(1)}
          className={cn(
            arrow,
            "right-0",
            edges.end && "pointer-events-none opacity-0",
          )}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
