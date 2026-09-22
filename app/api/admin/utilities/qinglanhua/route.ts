import { getTranslations } from "next-intl/server";
import { createDownloadHandler } from "@/lib/utilities/downloadRoute";
import {
  downloadQinglanhua,
  DuplicateContentError,
  findDownloadConflict,
} from "@/lib/utilities/qinglanhua";
import { createQinglanhuaDownloadSchema } from "@/lib/utilities/qinglanhuaSchema";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(request: Request) {
  const t = await getTranslations("DownloadValidation");
  return createDownloadHandler({
    schema: createQinglanhuaDownloadSchema(t),
    findConflict: findDownloadConflict,
    download: downloadQinglanhua,
    getErrorVideo: (error) =>
      error instanceof DuplicateContentError ? error.video : null,
  })(request);
}
