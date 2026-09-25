import type { useTranslations } from "next-intl";
import { formatSize } from "@/lib/format";
import type {
  DownloadProgress,
  DownloadProgressPresentation,
} from "@/lib/utilities/downloadTypes";

type Translate = ReturnType<typeof useTranslations<"DownloadFields">>;

/** One reading of a running download, shared by the list and the dock. */
export function presentDownloadProgress(
  progress: DownloadProgress | null,
  t: Translate,
  preparing: string,
): DownloadProgressPresentation {
  if (!progress) return { label: preparing, percent: null };
  if (progress.phase === "downloading") {
    const { received, total } = progress;
    return {
      label: t("downloading"),
      percent: total
        ? Math.min(100, Math.round((received / total) * 100))
        : null,
      detail: total
        ? // formatSize renders zero as a placeholder, not as a size.
          `${received > 0 ? formatSize(received) : "0 B"} / ${formatSize(total)}`
        : received > 0
          ? formatSize(received)
          : null,
    };
  }
  if (progress.phase === "extracting") {
    return {
      label:
        progress.layer && progress.layers
          ? t("extractingLayer", {
              layer: progress.layer,
              layers: progress.layers,
            })
          : t("extracting"),
      percent: progress.percent,
    };
  }
  return { label: t("importing"), percent: null };
}
