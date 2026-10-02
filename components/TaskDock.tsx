"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListChecksIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { presentDownloadProgress } from "@/components/admin/downloadProgress";
import { cancelTask, taskRatio, useTaskQueue } from "@/hooks/useTaskQueue";
import type { Job } from "@/lib/jobs";
import type {
  DownloadJobPayload,
  DownloadProgress,
} from "@/lib/utilities/downloadTypes";
import { cn } from "@/lib/utils";

/**
 * The queue, floating over every page.
 *
 * Work queued from one page finishes while the user is on another, so where it
 * is reported cannot be the page that started it. It shows itself only while
 * work is in flight. How a task ended, failures included, is reported by the
 * notification center, which the user can clear; a dock that stayed up for a
 * failure had no way to be dismissed.
 */

export default function TaskDock() {
  const t = useTranslations("TaskDock");
  const { active } = useTaskQueue();
  const [collapsed, setCollapsed] = useState(false);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);

  // The dock floats over the page. While it shows, the page reserves its
  // height at the bottom, so whatever it covers can still be scrolled clear
  // of it; on a phone that is often the action a row ends in.
  useEffect(() => {
    if (!dock) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty(
        "--task-dock-space",
        `calc(${entry.borderBoxSize[0].blockSize}px + 2rem)`,
      );
    });
    observer.observe(dock);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--task-dock-space");
    };
  }, [dock]);

  if (active.length === 0) return null;

  // Downloads run alongside library work, so several can be running at once.
  const running = active.filter((job) => job.status === "running");
  const queued = active.length - running.length;

  return (
    <div
      ref={setDock}
      className={cn(
        "fixed right-4 bottom-4 z-40 w-72 max-w-11/12",
        "rounded-lg border bg-card/90 shadow-lg backdrop-blur-md",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {running.length > 0 ? (
          <Spinner />
        ) : (
          <ListChecksIcon className="size-4" />
        )}
        <span className="text-sm font-medium">
          {t("active", { count: active.length })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground"
          aria-label={collapsed ? t("expand") : t("collapse")}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {running.map((job) => (
            <RunningTask key={job.id} job={job} />
          ))}

          {queued > 0 && <span>{t("queued", { count: queued })}</span>}

          <Link
            href="/admin/notifications"
            className="text-link underline-offset-2 hover:underline"
          >
            {t("viewNotifications")}
          </Link>
        </div>
      )}
    </div>
  );
}

function RunningTask({ job }: { job: Job }) {
  const t = useTranslations("TaskDock");
  const fields = useTranslations("DownloadFields");
  const downloads = useTranslations("Downloads");
  const notifications = useTranslations("Notifications");
  const common = useTranslations("Common");
  const [stopping, setStopping] = useState(false);
  const body = describeJob(t, job);
  // The notification a task ends in already names its kind.
  const title = notifications(`types.${job.kind}.label`);
  const download =
    job.kind === "VIDEO_DOWNLOAD"
      ? presentDownloadProgress(
          job.progress as DownloadProgress | null,
          fields,
          downloads("preparing"),
        )
      : null;
  const ratio = download
    ? download.percent === null
      ? null
      : download.percent / 100
    : taskRatio(job);
  const detail = download
    ? download.detail
    : job.total > 0
      ? `${job.processed} / ${job.total}`
      : null;

  async function stop() {
    setStopping(true);
    try {
      await cancelTask(job.id);
    } catch (cause) {
      setStopping(false);
      toast.error((cause as Error).message || common("operationFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-foreground" title={body}>
          {body}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t("cancelNamed", { title })}
          title={t("cancel")}
          disabled={stopping}
          onClick={() => void stop()}
        >
          {stopping ? <Spinner /> : <XIcon />}
        </Button>
      </div>
      <Progress
        value={ratio === null ? null : Math.round(ratio * 100)}
        aria-label={t("progress", { title })}
        className="gap-1"
      >
        {download && <span>{download.label}</span>}
        {detail && <span className="ml-auto tabular-nums">{detail}</span>}
      </Progress>
    </div>
  );
}

function stringValue(job: Job, key: string, fallback: string) {
  return typeof job.payload[key] === "string" ? job.payload[key] : fallback;
}

/** What the task is doing, with the values its payload carries. */
function describeJob(
  t: ReturnType<typeof useTranslations<"TaskDock">>,
  job: Job,
) {
  return t(`kinds.${job.kind}`, {
    tagName: stringValue(job, "tagName", ""),
    videoTitle: stringValue(job, "videoTitle", ""),
    name:
      job.kind === "VIDEO_DOWNLOAD"
        ? (job.payload as DownloadJobPayload).name
        : "",
  });
}
