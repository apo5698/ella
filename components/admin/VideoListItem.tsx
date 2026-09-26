"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { TagBadge } from "@/components/tags/TagBadge";
import { formatDuration, formatSize } from "@/lib/format";
import { resolutionLabel } from "@/lib/tagger";
import type { Video } from "@/lib/types";

export default function VideoListItem({
  video,
  checked,
  onCheckedChange,
}: {
  video: Video;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const resolution = resolutionLabel(video.width, video.height);

  const t = useTranslations("Common");
  return (
    <Item
      role="listitem"
      variant={checked ? "muted" : "outline"}
      className="items-start"
    >
      {onCheckedChange && (
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label={t("selectVideo", { title: video.title })}
        />
      )}
      <ItemMedia className="aspect-video w-28 overflow-hidden rounded-md bg-muted">
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-muted-foreground">{t("noThumbnail")}</span>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full max-w-full text-sm">
          <Link
            href={`/video/${video.id}`}
            className="block truncate hover:underline"
          >
            {video.title}
          </Link>
        </ItemTitle>
        <p className="flex flex-wrap items-center gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {t("duration")} {formatDuration(video.duration_sec)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="ml-1.5">
              ·
            </span>
            {t("size")}{" "}
            {video.size_bytes ? formatSize(video.size_bytes) : t("unknown")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="ml-1.5">
              ·
            </span>
            {t("resolution")} {resolution ?? t("unknown")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="ml-1.5">
              ·
            </span>
            {t("views")} {video.views}
          </span>
        </p>
        <div className="flex flex-wrap gap-1">
          {video.tags.map((tag) => (
            <TagBadge key={tag.id} source={tag.source}>
              {tag.name}
            </TagBadge>
          ))}
          {video.tags.length === 0 && (
            <span className="text-muted-foreground">{t("noTags")}</span>
          )}
        </div>
      </ItemContent>
    </Item>
  );
}
