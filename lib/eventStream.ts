/**
 * A server-sent event stream that pushes a fresh snapshot whenever one of its
 * sources changes. Nothing is sent while nothing changes.
 */

const ENCODER = new TextEncoder();

/** Keeps an idle connection from being dropped by an intermediary. */
const HEARTBEAT_MS = 25000;

/**
 * Changes arrive in bursts while a task reports progress. Sending at most one
 * snapshot per interval keeps a fast task from writing thousands of frames.
 */
const THROTTLE_MS = 200;

type Subscribe = (listener: () => void) => () => void;

export function eventStreamResponse(
  req: Request,
  {
    subscribe,
    snapshot,
  }: {
    subscribe: Subscribe[];
    snapshot: () => unknown;
  },
) {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribers: (() => void)[] = [];
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let pending: ReturnType<typeof setTimeout> | null = null;
      let lastSentAt = 0;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (pending) clearTimeout(pending);
        for (const unsubscribe of unsubscribers) unsubscribe();
        unsubscribers = [];
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
        write(`data: ${JSON.stringify(snapshot())}\n\n`);
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

      // The first frame is the whole snapshot, so a page that has just loaded
      // shows it without also fetching it.
      send();
      unsubscribers = subscribe.map((source) => source(schedule));
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
