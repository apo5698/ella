import { createQinglanhuaDownloadSchema } from "@/lib/utilities/qinglanhuaSchema";
import { createSykbDownloadSchema } from "@/lib/utilities/sykbSchema";
import type { DownloaderSource } from "@/lib/utilities/registry";

/** Each source's form schema, localized by the caller's translator. */
export const DOWNLOAD_SCHEMAS = {
  qinglanhua: createQinglanhuaDownloadSchema,
  sykb: createSykbDownloadSchema,
} satisfies Record<DownloaderSource, unknown>;

export function isDownloaderSource(value: unknown): value is DownloaderSource {
  return typeof value === "string" && Object.hasOwn(DOWNLOAD_SCHEMAS, value);
}
