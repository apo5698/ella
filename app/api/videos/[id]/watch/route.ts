import db from "@/lib/db";
import { isSameOrigin } from "@/lib/sameOrigin";
import { recordWatch, watchReportSchema } from "@/lib/watchEvents";

/**
 * Receives the player's report of how much of a video was watched, sent with
 * navigator.sendBeacon on pause, at the end and when the page is left. The
 * page never reads the answer.
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

  return new Response(null, {
    status: recordWatch(db, videoId, report.data) ? 204 : 404,
  });
}
