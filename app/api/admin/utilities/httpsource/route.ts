import { createDownloadHandler } from "@/lib/utilities/downloadRoute";
import {
  downloadHttpSource,
  DuplicateContentError,
  findDownloadConflict,
} from "@/lib/utilities/httpsource";
import { httpsourceDownloadSchema } from "@/lib/utilities/httpsourceSchema";

export const runtime = "nodejs";
export const maxDuration = 3600;

export const POST = createDownloadHandler({
  schema: httpsourceDownloadSchema,
  findConflict: findDownloadConflict,
  download: downloadHttpSource,
  getErrorVideo: (error) =>
    error instanceof DuplicateContentError ? error.video : null,
});
