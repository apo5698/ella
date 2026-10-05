import { notFound } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import db from "@/lib/db";
import { formatDuration, formatSize } from "@/lib/format";
import { loadHeat } from "@/lib/heat";
import { sortTags } from "@/lib/tagOrder";
import { loadTagPaths } from "@/lib/tagHierarchy";
import { loadRelated } from "@/lib/videoCards";
import VideoDetail from "./VideoDetail";
import type { Video } from "@/lib/types";

export default async function VideoPage({ params }: PageProps<"/video/[id]">) {
  const { id } = await params;
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
      `SELECT t.id, t.name, vt.source FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
       WHERE vt.video_id = ? AND vt.status = 'active'
       ORDER BY (vt.source = 'manual') DESC, t.name ASC`,
    )
    .all(id) as { id: number; name: string; source: string }[];

  // The ancestors travel with each tag, so the list and the editor can keep a
  // family together without either of them querying the hierarchy again.
  const paths = loadTagPaths(db);
  const tags = sortTags(
    allTags.map((tag) => ({
      ...tag,
      path: paths.get(tag.id) ?? [tag.name],
    })),
  );

  const { series, related } = loadRelated(db, video);

  return (
    <div className="min-h-screen overflow-x-clip bg-background p-4 text-foreground sm:p-6">
      <PageContainer className="max-w-[1760px]">
        <VideoDetail
          key={video.id}
          video={{
            id: video.id,
            title: video.title,
            mtime: video.mtime,
            seriesId: video.series_id,
          }}
          series={series}
          related={related}
          thumbnail={video.thumbnail}
          tags={tags}
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
          heat={loadHeat(db, video.id)}
        />
      </PageContainer>
    </div>
  );
}
