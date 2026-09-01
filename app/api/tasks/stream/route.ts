// Server-sent events carrying the task queue. The dock holds this open on
// every page, so nothing is sent while nothing changes: a write to the table
// is what pushes the next list.
import db from "@/lib/db";
import {
  activeTaskCount,
  listTasks,
  subscribeTasks,
  taskCount,
} from "@/lib/tasks";
import "@/lib/taskRunner";

export const runtime = "nodejs";

const ENCODER = new TextEncoder();

/** Keeps an idle connection from being dropped by an intermediary. */
const HEARTBEAT_MS = 25000;

/**
 * Changes arrive in bursts while a task reports progress. Sending at most one
 * list per interval keeps a fast task from writing thousands of frames.
 */
const THROTTLE_MS = 200;

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let pending: ReturnType<typeof setTimeout> | null = null;
      let lastSentAt = 0;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (pending) clearTimeout(pending);
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

      const send = () => {
        lastSentAt = Date.now();
        write(
          `data: ${JSON.stringify({
            tasks: listTasks(db),
            total: taskCount(db),
            activeCount: activeTaskCount(db),
          })}\n\n`,
        );
      };

      const schedule = () => {
        if (closed || pending) return;
        const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastSentAt));
        pending = setTimeout(() => {
          pending = null;
          send();
        }, wait);
      };

      if (req.signal.aborted) {
        close();
        return;
      }
      req.signal.addEventListener("abort", close);

      // The first frame is the whole list, so a page that has just loaded
      // shows the queue without also fetching it.
      send();
      unsubscribe = subscribeTasks(schedule);
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
