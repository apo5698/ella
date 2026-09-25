import { createHttpSourceDownloadSchema } from "@/lib/utilities/httpsourceSchema";
import { createShareDownloadSchema } from "@/lib/utilities/shareSchema";
import type { DownloaderSource } from "@/lib/utilities/registry";

/** Each source's form schema, localized by the caller's translator. */
export const DOWNLOAD_SCHEMAS = {
  httpsource: createHttpSourceDownloadSchema,
  share: createShareDownloadSchema,
} satisfies Record<DownloaderSource, unknown>;

export function isDownloaderSource(value: unknown): value is DownloaderSource {
  return typeof value === "string" && Object.hasOwn(DOWNLOAD_SCHEMAS, value);
}
