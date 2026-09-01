// Server-sent events carrying the batch tagging job. The log arrives one
// chunk at a time rather than as a whole array on every poll, and the job's
// own output drives delivery, so nothing is sent while nothing happens.
import { getJobState, subscribeJob, type JobEvent } from "@/lib/tagJob";

export const runtime = "nodejs";

const ENCODER = new TextEncoder();

/**
 * Unlike the per-video stream, this one outlives any single job: the settings
 * page holds it open across runs. A connection idle that long can be dropped
 * by an intermediary, so a comment goes out periodically to keep it alive.
 */
const HEARTBEAT_MS = 25000;

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // The client hung up first and the stream is already closed.
        }
      };

      const write = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(ENCODER.encode(payload));
        } catch {
          close();
        }
      };

      const send = (event: JobEvent) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // A browser that navigates away aborts the request; without this the
      // listener would outlive the reader it writes to. An abort that already
      // happened fires no event, so it is handled before subscribing at all.
      if (req.signal.aborted) {
        close();
        return;
      }
      req.signal.addEventListener("abort", close);

      // Sent before subscribing so a client arriving mid-run gets the log it
      // has missed and the bar at its true position.
      send({ kind: "snapshot", state: getJobState() });
      if (closed) return;
      unsubscribe = subscribeJob(send);

      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells a reverse proxy not to buffer, which would defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}
