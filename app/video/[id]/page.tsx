import fs from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import BackLabel from "@/components/BackLabel";
import PageContainer from "@/components/PageContainer";
import db from "@/lib/db";
import { formatDuration, formatSize } from "@/lib/format";
import { defaultThumbSec } from "@/lib/thumbnail";
import { sortNames, sortTags } from "@/lib/tagOrder";
import { loadTagPaths } from "@/lib/tagHierarchy";
import VideoDetail from "./VideoDetail";
import type { Video } from "@/lib/types";

export default async function VideoPage({
  params,
  searchParams,
}: PageProps<"/video/[id]">) {
  const { id } = await params;
  const { from } = await searchParams;
  const candidate = Array.isArray(from) ? from[0] : from;
  const requestedBackHref = candidate
    ? new URL(candidate, "http://localhost")
    : null;
  const backHref =
    requestedBackHref?.origin === "http://localhost" &&
    !requestedBackHref.pathname.startsWith("/video/") &&
    !requestedBackHref.pathname.startsWith("/api/")
      ? `${requestedBackHref.pathname}${requestedBackHref.search}${requestedBackHref.hash}`
      : "/";
  const video = db
    .prepare(
      `SELECT v.*, s.name AS series_name
       FROM videos v LEFT JOIN series s ON s.id = v.series_id
       WHERE v.id = ?`,
    )
    .get(id) as Video | undefined;
  if (!video) notFound();

  const allTags = db
    .prepare(
      `SELECT t.id, t.name, vt.source, vt.status FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
       WHERE vt.video_id = ?
       ORDER BY (vt.source = 'manual') DESC, t.name ASC`,
    )
    .all(id) as { id: number; name: string; source: string; status: string }[];

  // The ancestors travel with each tag, so the list and the editor can keep a
  // family together without either of them querying the hierarchy again.
  const paths = loadTagPaths(db);
  const tags = sortTags(
    allTags
      .filter((t) => t.status === "active")
      .map((t) => ({ ...t, path: paths.get(t.id) ?? [t.name] })),
  );
  const rejectedTags = sortNames(
    allTags.filter((t) => t.status === "rejected").map((t) => t.name),
  );

  // Resolved here so the mark inside the path field is right on open, without
  // the dialog having to ask the server before it can show anything.
  let pathExists = false;
  try {
    pathExists = fs.statSync(video.path).isFile();
  } catch {
    // Missing, unreadable, or the volume is not attached.
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <PageContainer>
        <Link
          href={backHref}
          className="flex items-center gap-1 self-start text-sm text-link hover:underline"
        >
          <BackLabel />
        </Link>

        <VideoDetail
          video={{
            id: video.id,
            title: video.title,
            path: video.path,
            duration_sec: video.duration_sec,
          }}
          thumbnail={video.thumbnail}
          // Where the current cover was taken from, so the scrubber opens on
          // it rather than jumping back to the default position.
          initialThumbSec={
            video.thumbnail_sec ?? defaultThumbSec(video.duration_sec)
          }
          initialPathExists={pathExists}
          tags={tags}
          rejectedTags={rejectedTags}
          seriesName={video.series_name ?? null}
          initialViews={video.views ?? 0}
          playerMeta={{
            duration: formatDuration(video.duration_sec),
            resolution:
              video.width && video.height
                ? `${video.width}x${video.height}`
                : null,
            size: formatSize(video.size_bytes),
          }}
        />
      </PageContainer>
    </div>
  );
}
