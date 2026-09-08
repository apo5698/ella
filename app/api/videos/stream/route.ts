import { subscribeVideoEvents, type VideoEvent } from "@/lib/videoEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENCODER = new TextEncoder();
const HEARTBEAT_MS = 25000;

export async function GET(req: Request) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => {};

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // The browser closed the connection first.
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

      if (req.signal.aborted) {
        close();
        return;
      }
      req.signal.addEventListener("abort", close);
      unsubscribe = subscribeVideoEvents((event: VideoEvent) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      });
      write("event: ready\ndata: {}\n\n");
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
