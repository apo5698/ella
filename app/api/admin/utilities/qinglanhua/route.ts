import { createDownloadHandler } from "@/lib/utilities/downloadRoute";
import {
  downloadQinglanhua,
  DuplicateContentError,
  findDownloadConflict,
} from "@/lib/utilities/qinglanhua";
import { qinglanhuaDownloadSchema } from "@/lib/utilities/qinglanhuaSchema";

export const runtime = "nodejs";
export const maxDuration = 3600;

export const POST = createDownloadHandler({
  schema: qinglanhuaDownloadSchema,
  findConflict: findDownloadConflict,
  download: downloadQinglanhua,
  getErrorVideo: (error) =>
    error instanceof DuplicateContentError ? error.video : null,
});
