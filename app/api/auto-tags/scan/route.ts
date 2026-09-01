import db from "@/lib/db";
import {
  createAutoTagSuggester,
  createFilenameTagRegex,
  loadAutoTagVideos,
  parseAutoTagStrategies,
} from "@/lib/autoTagging";

export const runtime = "nodejs";

const encoder = new TextEncoder();

/**
 * Streams one progress event per video. Suggestions are deliberately not
 * persisted: the browser owns them until the user explicitly reviews them.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const strategies = parseAutoTagStrategies(body.strategies);
  const regexPattern = String(body.regexPattern ?? "");
  if (strategies.length === 0) {
    return Response.json(
      { error: "请至少选择一种自动标记策略" },
      { status: 400 },
    );
  }
  if (strategies.includes("filename-regex")) {
    if (strategies.length !== 1) {
      return Response.json(
        { error: "正则表达式不能与其他策略同时使用" },
        { status: 400 },
      );
    }
    try {
      createFilenameTagRegex(regexPattern);
    } catch (cause) {
      return Response.json(
        { error: cause instanceof Error ? cause.message : "正则表达式无效" },
        { status: 400 },
      );
    }
  }

  const videos = loadAutoTagVideos(db);
  const suggest = createAutoTagSuggester(db, strategies, regexPattern);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({ kind: "start", total: videos.length });

        for (let index = 0; index < videos.length; index += 1) {
          if (req.signal.aborted) break;
          const suggestions = suggest(videos[index]);
          send({
            kind: "progress",
            processed: index + 1,
            total: videos.length,
            suggestions,
          });

          // Give the response stream a chance to flush so the UI advances as
          // videos are processed instead of receiving one large final chunk.
          await new Promise<void>((resolve) => setImmediate(resolve));
        }

        if (!req.signal.aborted) {
          send({
            kind: "done",
            processed: videos.length,
            total: videos.length,
          });
        }
      } catch (cause) {
        send({
          kind: "error",
          error: cause instanceof Error ? cause.message : "自动标记失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
