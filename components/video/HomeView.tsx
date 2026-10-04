"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import { isBrowsing } from "@/lib/homeFilters";
import type { TagCount } from "@/lib/types";
import type { HomeData, HomeShelf } from "@/lib/videoCards";
import BrowseView from "./BrowseView";
import ChipBar from "./ChipBar";
import ContinueWatching from "./ContinueWatching";
import HeroSpotlight from "./HeroSpotlight";
import Shelf from "./Shelf";

const CHIP_COUNT = 24;

function shelfTitle(
  shelf: HomeShelf,
  t: ReturnType<typeof useTranslations<"Discover">>,
) {
  switch (shelf.kind) {
    case "newest":
      return t("newest");
    case "popular":
      return t("popular");
    case "discover":
      return t("discover");
    case "series":
      return shelf.name ?? "";
  }
}

/**
 * The home page. With nothing chosen it is a curated front page; any search,
 * tag, series or order turns it into a list of the whole library.
 */
export default function HomeView({
  home,
  tags,
}: {
  home: HomeData;
  tags: TagCount[];
}) {
  const t = useTranslations("Discover");
  const params = useSearchParams();
  const browsing = isBrowsing(params);
  const chips = tags
    .filter((tag) => tag.reviewState !== "excluded" && tag.count > 0)
    .slice(0, CHIP_COUNT);

  return (
    <div className="flex-1 bg-background px-4 pb-12 text-foreground sm:px-6">
      <PageContainer className="flex max-w-[1760px] flex-col">
        <ChipBar tags={chips} />
        {browsing ? (
          <div className="pt-3">
            <BrowseView tags={tags} />
          </div>
        ) : (
          <div className="flex flex-col gap-10 pt-2">
            <h1 className="sr-only">{t("title")}</h1>
            <HeroSpotlight videos={home.featured} />
            <ContinueWatching />
            {home.shelves.map((shelf, index) => (
              <Shelf
                key={shelf.id}
                id={shelf.id}
                index={index + 1}
                title={shelfTitle(shelf, t)}
                href={shelf.query ? `/?${shelf.query}` : undefined}
                videos={shelf.videos}
              />
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
