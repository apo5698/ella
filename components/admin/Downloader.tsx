"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { DownloadIcon, SearchXIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import SearchInput from "@/components/SearchInput";
import DownloadList, { downloadRequest } from "@/components/admin/DownloadList";
import NewDownloadDialog from "@/components/admin/NewDownloadDialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { DownloadList as DownloadListData } from "@/lib/utilities/downloadJobs";

const SEARCH_DELAY_MS = 250;

/** The download history, live, filtered on the server by `query`. */
function useDownloads(query: string) {
  const [data, setData] = useState<DownloadListData | null>(null);
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const source = new EventSource(
      `/api/admin/utilities/downloads/stream?q=${encodeURIComponent(debounced)}`,
    );
    source.onmessage = (event) => setData(JSON.parse(event.data));
    return () => source.close();
  }, [debounced]);

  return { data, searching: debounced.trim() !== "" };
}

/**
 * Every download from every source in one list. The transfer runs in the
 * task queue, so the list survives leaving the page and reloading.
 */
export default function Downloader() {
  const t = useTranslations("Downloads");
  const common = useTranslations("Common");
  const [query, setQuery] = useState("");
  const [clearing, setClearing] = useState(false);
  const { data, searching } = useDownloads(query);
  const hasFinished = data?.downloads.some(
    (job) => !["running", "queued", "pending"].includes(job.status),
  );

  async function clearFinished() {
    setClearing(true);
    try {
      await downloadRequest("/api/admin/utilities/downloads", "DELETE");
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : common("operationFailed"),
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-56 flex-1"
        />
        {!searching && hasFinished && (
          <Button
            variant="outline"
            disabled={clearing}
            onClick={() => void clearFinished()}
          >
            {clearing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2Icon data-icon="inline-start" />
            )}
            {t("clearFinished")}
          </Button>
        )}
        <NewDownloadDialog />
      </div>

      {!data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.downloads.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {searching ? <SearchXIcon /> : <DownloadIcon />}
            </EmptyMedia>
            <EmptyTitle>{t(searching ? "emptySearch" : "empty")}</EmptyTitle>
            {!searching && (
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DownloadList downloads={data.downloads} />
          {data.total > data.downloads.length && (
            <p className="text-center text-xs text-muted-foreground">
              {t("limited", {
                shown: data.downloads.length,
                total: data.total,
              })}
            </p>
          )}
        </>
      )}
    </>
  );
}
