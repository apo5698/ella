"use client";

import { useTranslations } from "next-intl";

import { useState, type ReactNode } from "react";
import {
  BanIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  FolderSearchIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import AcceptButton from "@/components/AcceptButton";
import LocalTime from "@/components/LocalTime";
import Link from "next/link";
import { presentDownloadProgress } from "@/components/admin/downloadProgress";
import { downloadRequest } from "@/components/admin/downloadRequest";
import DownloadInspectDialog from "@/components/admin/DownloadInspectDialog";
import { AutoTagSuggestionList } from "@/components/tags/AutoTagSuggestionList";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
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
    <div className="flex w-full flex-col gap-1.5 text-xs/relaxed">
      <div className="flex items-baseline gap-3">
        <span className="font-medium">{progress.label}</span>
        {progress.detail && (
          <span className="ml-auto text-muted-foreground tabular-nums">
            {progress.detail}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Progress
          value={progress.percent}
          max={100}
          aria-label={progress.label}
          className="flex-1"
        />
        {progress.percent !== null && (
          <span className="w-9 text-right text-muted-foreground tabular-nums">
            {progress.percent}%
          </span>
        )}
      </div>
    </div>
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
      return <span>{t("preparing")}</span>;
    case "pending":
      return (
        <span>
          {t("addedAt")} <LocalTime value={job.createdAt} />
        </span>
      );
    case "succeeded":
      return <LocalTime value={at} />;
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
              <Link href={`/video/${failure.video.id}`}>{t("view")}</Link>
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
          <Link
            key={match.id}
            href={`/video/${match.id}`}
          >{`"${match.title}"`}</Link>
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

type RowActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

/**
 * Icon buttons on a wide screen. On a phone they would take the width the
 * name needs, so more than one folds into a menu.
 */
function RowActions({
  actions,
  disabled,
}: {
  actions: RowActionItem[];
  disabled: boolean;
}) {
  const t = useTranslations("Downloads");
  const buttons = actions.map((action) => (
    <Button
      key={action.key}
      variant="ghost"
      size="icon"
      aria-label={action.label}
      title={action.label}
      disabled={disabled}
      onClick={action.onSelect}
    >
      {action.icon}
    </Button>
  ));
  if (actions.length <= 1) return buttons;
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <>
      <div className="flex max-sm:hidden">{buttons}</div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("actions")}
              disabled={disabled}
              className="sm:hidden"
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {regular.length > 0 && (
            <DropdownMenuGroup>
              {regular.map((action) => (
                <DropdownMenuItem key={action.key} onClick={action.onSelect}>
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {regular.length > 0 && destructive.length > 0 && (
            <DropdownMenuSeparator />
          )}
          {destructive.length > 0 && (
            <DropdownMenuGroup>
              {destructive.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  variant="destructive"
                  onClick={action.onSelect}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function DownloadRow({ job }: { job: DownloadListItem }) {
  const t = useTranslations("Downloads");
  const common = useTranslations("Common");
  const utilities = useTranslations("Utilities");
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectKey, setInspectKey] = useState(0);
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
  const inspectable =
    job.status === "failed" &&
    Boolean((job.outcome as { inspectable?: boolean } | null)?.inspectable);

  // What can be done depends on where the download is. The same list feeds
  // the row's icons on a wide screen and its menu on a phone.
  const actions: RowActionItem[] = [];
  if (job.status === "pending")
    actions.push({
      key: "start",
      label: t("start"),
      icon: <PlayIcon />,
      onSelect: () => void act(start, "POST"),
    });
  if (inspectable)
    actions.push({
      key: "inspect",
      label: t("inspect"),
      icon: <FolderSearchIcon />,
      onSelect: () => {
        setInspectKey((key) => key + 1);
        setInspecting(true);
      },
    });
  if (job.status === "failed" || job.status === "canceled")
    actions.push({
      key: "retry",
      label: t("retry"),
      icon: <RotateCcwIcon />,
      onSelect: () => void act(start, "POST"),
    });
  if (job.status === "running" || job.status === "queued")
    actions.push({
      key: "cancel",
      label: common("cancel"),
      icon: <XIcon />,
      onSelect: () => void act(`/api/tasks/${job.id}/cancel`, "POST"),
    });
  else
    actions.push({
      key: "remove",
      label: t("remove"),
      icon: <Trash2Icon />,
      destructive: true,
      onSelect: () => void act(`/api/tasks/${job.id}`, "DELETE"),
    });

  const title = result?.videoId ? result.title : name;

  return (
    <Item role="listitem" variant="outline" className="flex-nowrap items-start">
      <ItemMedia variant="icon" className="mt-0.5">
        <StatusIcon job={job} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 w-auto break-all" title={title}>
          {result?.videoId ? (
            <Link href={`/video/${result.videoId}`}>{title}</Link>
          ) : (
            title
          )}
        </ItemTitle>
        <ItemDescription className="truncate text-xs">
          {sourceItem ? utilities(sourceItem.name) : source}
          {/* A share link says little on a phone once it is cut short. */}
          {url && <span className="max-sm:hidden">{` · ${url}`}</span>}
        </ItemDescription>
        <div className="text-xs text-muted-foreground">
          <StatusLine job={job} />
        </div>
        {job.status === "running" && (
          <div className="pt-1">
            <RunningProgress job={job} />
          </div>
        )}
        {result?.videoId && (
          <div className="flex flex-col gap-2 pt-1 empty:hidden">
            <ImportNotes result={result} />
            <Suggestions job={job} result={result} />
          </div>
        )}
      </ItemContent>
      <ItemActions className="-my-1 shrink-0 gap-0">
        <RowActions actions={actions} disabled={busy} />
      </ItemActions>
      {inspectable && (
        <DownloadInspectDialog
          key={inspectKey}
          jobId={job.id}
          open={inspecting}
          onOpenChange={setInspecting}
        />
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
