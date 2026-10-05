import { useTranslations } from "next-intl";
import { formatDuration } from "@/lib/format";
import type { Video } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A small still for admin lists, with the length on the picture as on the
 * cards people browse. Size it with `className`.
 */
export default function AdminVideoThumbnail({
  video,
  className,
}: {
  video: Pick<Video, "thumbnail" | "duration_sec">;
  className?: string;
}) {
  const common = useTranslations("Common");
  return (
    <span
      className={cn(
        "relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{common("noThumbnail")}</span>
      {video.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={video.thumbnail}
          src={video.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      )}
      {video.duration_sec ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1 py-px text-[0.625rem]/none text-white tabular-nums backdrop-blur-sm">
          {formatDuration(video.duration_sec)}
        </span>
      ) : null}
    </span>
  );
}
