import { errorMessage, type AppError } from "@/lib/appError";
import { getTranslations } from "next-intl/server";
import type { VideoRef } from "@/lib/duplicates";
import type { ImportedDownloadResult } from "@/lib/utilities/downloadTypes";

type Schema<TInput> = {
  safeParse(value: unknown):
    | { success: true; data: TInput }
    | {
        success: false;
        error: { issues: { message: string }[] };
      };
};

type Conflict = {
  error: AppError;
  reason: "name" | "file" | "similar";
  video: (VideoRef & { score?: number }) | null;
};

export function createDownloadHandler<TInput, TProgress>({
  schema,
  findConflict,
  download,
  getErrorVideo,
}: {
  schema: Schema<TInput>;
  findConflict?: (input: TInput) => Conflict | null;
  download: (
    input: TInput,
    onProgress: (progress: TProgress) => void,
  ) => Promise<ImportedDownloadResult>;
  getErrorVideo?: (error: unknown) => VideoRef | null;
}) {
  const encoder = new TextEncoder();

  return async function POST(request: Request) {
    const t = await getTranslations("DownloadValidation");
    const errors = await getTranslations("Api");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? t("invalidParameters") },
        { status: 400 },
      );
    }

    const conflict = findConflict?.(parsed.data);
    if (conflict) {
      return Response.json(
        {
          error: errorMessage(conflict.error, errors),
          reason: conflict.reason,
          video: conflict.video,
        },
        { status: 409 },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            closed = true;
          }
        };

        try {
          const result = await download(parsed.data, (progress) =>
            send({ kind: "progress", progress }),
          );
          send({ kind: "done", result });
        } catch (error) {
          send({
            kind: "error",
            error: errorMessage(error, errors),
            video: getErrorVideo?.(error) ?? null,
          });
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            // The client already closed the stream.
          }
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
  };
}
