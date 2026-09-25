"use client";

import { useTranslations } from "next-intl";

import { useState, type ReactNode } from "react";
import {
  BanIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import AcceptButton from "@/components/AcceptButton";
import LocalTime from "@/components/LocalTime";
import VideoLink from "@/components/VideoLink";
import { presentDownloadProgress } from "@/components/admin/downloadProgress";
import { AutoTagSuggestionList } from "@/components/tags/AutoTagSuggestionList";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  autoTagSuggestionKey,
  type AutoTagSuggestion,
} from "@/lib/autoTagging";
import type { DownloadListItem } from "@/lib/utilities/downloadJobs";
import type {
  DownloadJobFailure,
  DownloadProgress,
  ImportedDownloadResult,
} from "@/lib/utilities/downloadTypes";
import { DOWNLOADER_SOURCES } from "@/lib/utilities/registry";

export async function downloadRequest(
  url: string,
  method: "POST" | "DELETE",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error);
  return data;
}

function StatusIcon({ job }: { job: DownloadListItem }) {
  switch (job.status) {
    case "running":
    case "queued":
      return <Spinner />;
    case "pending":
      return <ClockIcon className="text-muted-foreground" />;
    case "succeeded":
      return <CircleCheckIcon className="text-success" />;
    case "failed":
      return <CircleXIcon className="text-destructive" />;
    case "canceled":
      return <BanIcon className="text-muted-foreground" />;
  }
}

function RunningProgress({ job }: { job: DownloadListItem }) {
  const t = useTranslations("Downloads");
  const fields = useTranslations("DownloadFields");
  const progress = presentDownloadProgress(
    job.progress as DownloadProgress | null,
    fields,
    t("preparing"),
  );
  return (
    <Progress value={progress.percent} max={100} className="w-full">
      <ProgressLabel>{progress.label}</ProgressLabel>
      <span className="ml-auto text-xs/relaxed tabular-nums text-muted-foreground">
        {[
          progress.percent === null ? null : `${progress.percent}%`,
          progress.detail,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </Progress>
  );
}

function StatusLine({ job }: { job: DownloadListItem }) {
  const t = useTranslations("Downloads");
  const errors = useTranslations("Api");
  const at = job.finishedAt ?? job.createdAt;
  switch (job.status) {
    case "running":
      return null;
    case "queued":
      return <span>{t("starting")}</span>;
    case "pending":
      return (
        <span>
          {t("addedAt")} <LocalTime value={job.createdAt} />
        </span>
      );
    case "succeeded":
      return (
        <span>
          {t("added")} · <LocalTime value={at} />
        </span>
      );
    case "canceled":
      return (
        <span>
          {t("canceled")} · <LocalTime value={at} />
        </span>
      );
    case "failed": {
      const failure = job.outcome as DownloadJobFailure | null;
      return (
        <span className="text-destructive">
          {failure?.error
            ? errors(failure.error.code as never, failure.error.values as never)
            : t("failed")}
          {failure?.video && (
            <>
              {" "}
              <VideoLink href={`/video/${failure.video.id}`}>
                {t("view")}
              </VideoLink>
            </>
          )}
          {" · "}
          <LocalTime value={at} />
        </span>
      );
    }
  }
}

function ImportNotes({ result }: { result: ImportedDownloadResult }) {
  const t = useTranslations("Downloads");
  const notes: ReactNode[] = [];
  if (result.truncated) notes.push(<span key="t">{t("truncated")}</span>);
  for (const [key, label, matches] of [
    ["d", t("duplicates"), result.duplicates],
    ["s", t("similarNames"), result.similar],
  ] as const) {
    if (matches.length === 0) continue;
    notes.push(
      <span key={key} className="flex flex-wrap gap-x-1">
        {label}
        {matches.map((match) => (
          <VideoLink
            key={match.id}
            href={`/video/${match.id}`}
          >{`"${match.title}"`}</VideoLink>
        ))}
      </span>,
    );
  }
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {notes}
    </div>
  );
}

function Suggestions({
  job,
  result,
}: {
  job: DownloadListItem;
  result: ImportedDownloadResult;
}) {
  const suggestionText = useTranslations("SuggestionActions");
  const [reviewing, setReviewing] = useState(false);
  if (result.autoTagSuggestions.length === 0) return null;

  async function review(suggestions: AutoTagSuggestion[], accept: boolean) {
    setReviewing(true);
    try {
      let count = suggestions.length;
      if (accept) {
        const data = await downloadRequest("/api/auto-tags/review", "POST", {
          videoId: result.videoId,
          suggestions: suggestions.map(({ name, strategy, regexPattern }) => ({
            name,
            strategy,
            regexPattern,
          })),
        });
        count = data.names.length;
      }
      await downloadRequest(
        `/api/admin/utilities/downloads/${job.id}/suggestions`,
        "POST",
        { keys: suggestions.map(autoTagSuggestionKey) },
      );
      toast.success(suggestionText(accept ? "accepted" : "skipped", { count }));
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : suggestionText("reviewFailed"),
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md bg-muted/50 p-2">
      <span className="text-xs font-medium">{suggestionText("title")}</span>
      <AutoTagSuggestionList
        suggestions={result.autoTagSuggestions}
        disabled={reviewing}
        onAccept={(suggestion) => void review([suggestion], true)}
        onSkip={(suggestion) => void review([suggestion], false)}
      />
      <div className="flex justify-end gap-1">
        <AcceptButton
          type="button"
          size="sm"
          disabled={reviewing}
          onClick={() => void review(result.autoTagSuggestions, true)}
        >
          <CheckIcon data-icon="inline-start" />
          {suggestionText("acceptAll")}
        </AcceptButton>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={reviewing}
          onClick={() => void review(result.autoTagSuggestions, false)}
        >
          <XIcon data-icon="inline-start" />
          {suggestionText("skipAll")}
        </Button>
      </div>
    </div>
  );
}

function RowAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

function DownloadRow({ job }: { job: DownloadListItem }) {
  const t = useTranslations("Downloads");
  const common = useTranslations("Common");
  const utilities = useTranslations("Utilities");
  const [busy, setBusy] = useState(false);
  const { source, name, url } = job.payload;
  const sourceItem = DOWNLOADER_SOURCES.find((item) => item.slug === source);
  const result =
    job.status === "succeeded"
      ? (job.outcome as ImportedDownloadResult | null)
      : null;

  async function act(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    try {
      await downloadRequest(path, method);
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : common("operationFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const start = `/api/admin/utilities/downloads/${job.id}/start`;
  const remove = (
    <RowAction
      label={t("remove", { name })}
      icon={<Trash2Icon />}
      disabled={busy}
      onClick={() => void act(`/api/tasks/${job.id}`, "DELETE")}
    />
  );

  return (
    <Item role="listitem" variant="outline">
      <ItemMedia variant="icon">
        <StatusIcon job={job} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="break-all">
          {result?.videoId ? (
            <VideoLink href={`/video/${result.videoId}`}>
              {result.title}
            </VideoLink>
          ) : (
            name
          )}
        </ItemTitle>
        <ItemDescription className="truncate text-xs">
          {sourceItem ? utilities(sourceItem.name) : source}
          {url && ` · ${url}`}
        </ItemDescription>
        <div className="text-xs text-muted-foreground">
          <StatusLine job={job} />
        </div>
      </ItemContent>
      <ItemActions>
        {job.status === "pending" && (
          <RowAction
            label={t("start", { name })}
            icon={<PlayIcon />}
            disabled={busy}
            onClick={() => void act(start, "POST")}
          />
        )}
        {(job.status === "failed" || job.status === "canceled") && (
          <RowAction
            label={t("retry", { name })}
            icon={<RotateCcwIcon />}
            disabled={busy}
            onClick={() => void act(start, "POST")}
          />
        )}
        {job.status === "running" || job.status === "queued" ? (
          <RowAction
            label={t("cancel", { name })}
            icon={<XIcon />}
            disabled={busy}
            onClick={() => void act(`/api/tasks/${job.id}/cancel`, "POST")}
          />
        ) : (
          remove
        )}
      </ItemActions>
      {job.status === "running" && (
        <ItemFooter>
          <RunningProgress job={job} />
        </ItemFooter>
      )}
      {result?.videoId && (
        <ItemFooter className="flex-col items-stretch empty:hidden">
          <ImportNotes result={result} />
          <Suggestions job={job} result={result} />
        </ItemFooter>
      )}
    </Item>
  );
}

function Section({
  title,
  action,
  downloads,
}: {
  title: string;
  action?: ReactNode;
  downloads: DownloadListItem[];
}) {
  if (downloads.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">
          {title}
          <span className="ml-1 tabular-nums">{downloads.length}</span>
        </h2>
        {action}
      </div>
      <ItemGroup>
        {downloads.map((job) => (
          <DownloadRow key={job.id} job={job} />
        ))}
      </ItemGroup>
    </section>
  );
}

/**
 * Downloading first, then pending, then everything settled, newest first.
 * The server sends them in that order.
 */
export default function DownloadList({
  downloads,
}: {
  downloads: DownloadListItem[];
}) {
  const t = useTranslations("Downloads");
  const common = useTranslations("Common");
  const fields = useTranslations("DownloadFields");
  const [startingAll, setStartingAll] = useState(false);
  const active = downloads.filter(
    (job) => job.status === "running" || job.status === "queued",
  );
  const pending = downloads.filter((job) => job.status === "pending");
  const finished = downloads.filter(
    (job) => !active.includes(job) && !pending.includes(job),
  );

  async function startAll() {
    setStartingAll(true);
    try {
      await Promise.all(
        pending.map((job) =>
          downloadRequest(
            `/api/admin/utilities/downloads/${job.id}/start`,
            "POST",
          ),
        ),
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : common("operationFailed"),
      );
    } finally {
      setStartingAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title={fields("downloading")} downloads={active} />
      <Section
        title={t("sectionPending")}
        downloads={pending}
        action={
          pending.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={startingAll}
              onClick={() => void startAll()}
            >
              {startingAll ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {t("startAll")}
            </Button>
          )
        }
      />
      <Section title={t("sectionFinished")} downloads={finished} />
    </div>
  );
}
