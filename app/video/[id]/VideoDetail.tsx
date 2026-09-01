"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import type {
  EditableVideo,
  VideoDetailTag,
  VideoMetadataPatch,
  VideoTagState,
} from "@/lib/types";
import TagList from "./TagList";
import VideoActions from "./VideoActions";
import VideoPlayer from "./VideoPlayer";

export default function VideoDetail({
  video,
  thumbnail,
  initialThumbSec,
  initialPathExists,
  tags,
  rejectedTags,
  seriesName,
  initialViews,
  playerMeta,
}: {
  video: EditableVideo;
  thumbnail: string | null;
  initialThumbSec: number;
  initialPathExists: boolean;
  tags: VideoDetailTag[];
  rejectedTags: string[];
  seriesName: string | null;
  initialViews: number;
  playerMeta: { duration: string; resolution: string | null; size: string };
}) {
  const { tasks } = useTaskQueue();
  const mountedAt = useRef(0);
  const syncedTask = useRef<number | null>(null);
  const [metadata, setMetadata] = useState({
    video,
    thumbnail,
    thumbSec: initialThumbSec,
  });
  const [tagState, setTagState] = useState<VideoTagState>({
    tags,
    rejectedTags,
    seriesName,
  });

  const handleSaved = useCallback((patch: VideoMetadataPatch) => {
    setMetadata((current) => ({
      video: { ...current.video, title: patch.title, path: patch.path },
      thumbnail: patch.thumbnail ?? current.thumbnail,
      thumbSec: patch.thumbnailSec ?? current.thumbSec,
    }));
  }, []);

  const handleTagStateChange = useCallback((state: VideoTagState) => {
    setTagState(state);
  }, []);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    const completed = tasks.find((task) => {
      if (
        task.kind !== "retag-video" ||
        task.status !== "succeeded" ||
        task.finishedAt === null ||
        task.finishedAt < mountedAt.current ||
        task.id === syncedTask.current
      ) {
        return false;
      }
      try {
        return (
          Number(
            (JSON.parse(task.payload) as { videoId?: unknown }).videoId,
          ) === video.id
        );
      } catch {
        return false;
      }
    });
    if (!completed) return;

    syncedTask.current = completed.id;
    const controller = new AbortController();
    void fetch(`/api/videos/${video.id}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("无法更新标签");
        return response.json() as Promise<{ tagState?: VideoTagState }>;
      })
      .then((result) => {
        if (result.tagState) setTagState(result.tagState);
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError") {
          console.error("[video] 无法同步重新识别结果", cause);
        }
      });
    return () => controller.abort();
  }, [tasks, video.id]);

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-2 mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-all text-2xl font-semibold">
            {metadata.video.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            id={metadata.video.id}
          </p>
        </div>
        <div className="shrink-0">
          <VideoActions
            video={metadata.video}
            initialThumbSec={metadata.thumbSec}
            initialPathExists={initialPathExists}
            tags={tagState.tags}
            rejectedTags={tagState.rejectedTags}
            seriesName={tagState.seriesName}
            onSaved={handleSaved}
            onTagStateChange={handleTagStateChange}
          />
        </div>
      </div>

      <VideoPlayer
        videoId={metadata.video.id}
        src={`/api/stream/${metadata.video.id}`}
        poster={metadata.thumbnail ?? undefined}
        initialViews={initialViews}
        meta={playerMeta}
      />

      <TagList series={tagState.seriesName} tags={tagState.tags} />
    </div>
  );
}
