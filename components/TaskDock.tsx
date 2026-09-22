"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { taskRatio, useTaskQueue } from "@/hooks/useTaskQueue";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * The queue, floating over every page.
 *
 * Work queued from one page finishes while the user is on another, so where it
 * is reported cannot be the page that started it. It shows itself only when
 * there is something to say: work in flight, or an unread failure.
 * A task that finishes at once is reported by the page that queued it.
 */

export default function TaskDock() {
  const t = useTranslations("TaskDock");
  const { jobs, active, running } = useTaskQueue();
  const [collapsed, setCollapsed] = useState(false);

  const failed = jobs.filter((job) => job.status === "failed");
  if (active.length === 0 && failed.length === 0) return null;

  const queued = active.length - (running ? 1 : 0);
  const ratio = running ? taskRatio(running) : null;
  const runningMessage = running ? formatJob(t, running) : null;

  return (
    <div
      className={cn(
        "fixed right-4 bottom-4 z-40 w-72 max-w-11/12",
        "rounded-lg border bg-card/90 shadow-lg backdrop-blur-md",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {running ? <Spinner /> : <ListChecksIcon className="size-4" />}
        <span className="text-sm font-medium">
          {active.length > 0
            ? t("active", { count: active.length })
            : t("failed", { count: failed.length })}
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
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
          {running && (
            <div className="flex flex-col gap-1">
              <span
                className="truncate text-foreground"
                title={runningMessage?.body}
              >
                {runningMessage?.body}
              </span>
              <Progress
                value={ratio === null ? null : Math.round(ratio * 100)}
                aria-label={t("progress", {
                  title: runningMessage?.title ?? "",
                })}
                className="gap-1"
              >
                {running.total > 0 && (
                  <span className="ml-auto tabular-nums">
                    {running.processed} / {running.total}
                  </span>
                )}
              </Progress>
            </div>
          )}

          {queued > 0 && <span>{t("queued", { count: queued })}</span>}
          {failed.length > 0 && (
            <span className="text-destructive">
              {t("failed", { count: failed.length })}
            </span>
          )}

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

function stringValue(job: Job, key: string, fallback: string) {
  return typeof job.payload[key] === "string" ? job.payload[key] : fallback;
}

function formatJob(
  t: ReturnType<typeof useTranslations<"TaskDock">>,
  job: Job,
) {
  const values = {
    tagName: stringValue(job, "tagName", ""),
    videoTitle: stringValue(job, "videoTitle", ""),
  };
  return {
    title: t(`kinds.${job.kind}.title`),
    body: t(`kinds.${job.kind}.body`, values),
  };
}
