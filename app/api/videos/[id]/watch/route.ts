import db from "@/lib/db";
import { isSameOrigin } from "@/lib/sameOrigin";
import { notifyVideoMetrics } from "@/lib/videoEvents";
import { recordWatch, watchReportSchema } from "@/lib/watchEvents";

/**
 * Receives the player's report of how much of a video was watched, sent on
 * pause, at the end, when the page is left, and once when the sitting plays
 * long enough to be a view. That last report reads the new view count from
 * the answer; the others go out with navigator.sendBeacon and ignore it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId)) return new Response(null, { status: 404 });

  const report = watchReportSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!report.success) return new Response(null, { status: 400 });

  const result = recordWatch(db, videoId, report.data);
  if (!result.found) return new Response(null, { status: 404 });
  if (result.views === null) return new Response(null, { status: 204 });
  notifyVideoMetrics({ videoId, views: result.views });
  return Response.json({ views: result.views });
}
