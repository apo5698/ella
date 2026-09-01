import VideoLink from "@/components/VideoLink";
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
          aria-label={`选择 ${video.title}`}
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
          <span className="text-muted-foreground">无封面</span>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full max-w-full text-sm">
          <VideoLink
            href={`/video/${video.id}`}
            className="block truncate hover:underline"
          >
            {video.title}
          </VideoLink>
        </ItemTitle>
        <p
          className="truncate text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
          title={video.path}
        >
          {video.path}
        </p>
        <p className="flex flex-wrap gap-x-3 text-muted-foreground">
          <span>时长 {formatDuration(video.duration_sec)}</span>
          <span>大小 {formatSize(video.size_bytes)}</span>
          <span>分辨率 {resolution ?? "未知"}</span>
          <span>播放 {video.views}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {video.tags.map((tag) => (
            <TagBadge key={tag.id} source={tag.source}>
              {tag.name}
            </TagBadge>
          ))}
          {video.tags.length === 0 && (
            <span className="text-muted-foreground">暂无标签</span>
          )}
        </div>
      </ItemContent>
    </Item>
  );
}
