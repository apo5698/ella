"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { VideoCardData } from "@/lib/types";
import { useWatchProgress } from "@/lib/watchProgress";
import Shelf from "./Shelf";

const SHOWN = 18;

/** The videos this browser stopped part way through, most recent first. */
export default function ContinueWatching() {
  const t = useTranslations("Discover");
  const progress = useWatchProgress();
  const ids = useMemo(
    () =>
      Object.entries(progress)
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, SHOWN)
        .map(([id]) => Number(id)),
    [progress],
  );
  const key = ids.join(",");
  const [videos, setVideos] = useState<VideoCardData[]>([]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/videos?ids=${key}&pageSize=${SHOWN}`, {
      signal: controller.signal,
    })
      .then(
        (response) => response.json() as Promise<{ videos: VideoCardData[] }>,
      )
      .then((data) => {
        const byId = new Map(data.videos.map((video) => [video.id, video]));
        setVideos(
          key
            .split(",")
            .map((id) => byId.get(Number(id)))
            .filter((video): video is VideoCardData => Boolean(video)),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [key]);

  if (!key || videos.length === 0) return null;
  return <Shelf id="continue" title={t("continueWatching")} videos={videos} />;
}
