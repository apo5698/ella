import { getTranslations } from "next-intl/server";
import { createDownloadHandler } from "@/lib/utilities/downloadRoute";
import {
  downloadHttpSource,
  DuplicateContentError,
  findDownloadConflict,
} from "@/lib/utilities/httpsource";
import { createHttpSourceDownloadSchema } from "@/lib/utilities/httpsourceSchema";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(request: Request) {
  const t = await getTranslations("DownloadValidation");
  return createDownloadHandler({
    schema: createHttpSourceDownloadSchema(t),
    findConflict: findDownloadConflict,
    download: downloadHttpSource,
    getErrorVideo: (error) =>
      error instanceof DuplicateContentError ? error.video : null,
  })(request);
}
