import fs from "node:fs";
import { notFound } from "next/navigation";
import db from "@/lib/db";
import { formatDimensions, formatDuration, formatSize } from "@/lib/format";
import { loadVideoTagState } from "@/lib/tags";
import type { Video } from "@/lib/types";
import { parseVideoListParams, videoNeighbours } from "@/lib/videoQuery";
import VideoWorkbench from "./VideoWorkbench";

/** The manager lists newest first, and omits the sort from its URL then. */
const MANAGER_DEFAULT_SORT = "newest";

function defaultThumbSec(duration: number | null) {
  return duration ? Math.min(Math.max(duration * 0.15, 1), 60) : 3;
}

export default async function AdminVideoPage({
  params,
  searchParams,
}: PageProps<"/admin/videos/[id]">) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();

  const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as
    Video | undefined;
  if (!video) notFound();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const neighbours = videoNeighbours(
    db,
    parseVideoListParams(query, MANAGER_DEFAULT_SORT),
    id,
  );

  return (
    <VideoWorkbench
      key={video.id}
      video={{
        id: video.id,
        title: video.title,
        path: video.path,
        thumbnail: video.thumbnail,
        durationSec: video.duration_sec,
      }}
      initialThumbSec={
        video.thumbnail_sec ?? defaultThumbSec(video.duration_sec)
      }
      initialPathExists={fs.existsSync(video.path)}
      initialTagState={loadVideoTagState(db, id)}
      neighbours={neighbours}
      views={video.views ?? 0}
      playerMeta={{
        duration: formatDuration(video.duration_sec),
        resolution: formatDimensions(video.width, video.height),
        size: formatSize(video.size_bytes),
      }}
    />
  );
}
