"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { taskRatio, useTaskQueue } from "@/hooks/useTaskQueue";
import { cn } from "@/lib/utils";

/**
 * The queue, floating over every page.
 *
 * Work queued from one page finishes while the user is on another, so where it
 * is reported cannot be the page that started it. It shows itself only when
 * there is something to say: work in flight, or a failure nobody has cleared.
 * A task that finishes at once is reported by the page that queued it.
 */

export default function TaskDock() {
  const { tasks, active, running } = useTaskQueue();
  const [collapsed, setCollapsed] = useState(false);

  const failed = tasks.filter((task) => task.status === "failed");
  if (active.length === 0 && failed.length === 0) return null;

  const queued = active.length - (running ? 1 : 0);
  const ratio = running ? taskRatio(running) : null;

  return (
    <div
      className={cn(
        "fixed right-4 bottom-4 z-40 w-72 max-w-11/12",
        "rounded-lg border bg-card/90 shadow-lg backdrop-blur-md",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {running ? <Spinner /> : <ListChecks className="size-4" />}
        <span className="text-sm font-medium">
          {active.length > 0
            ? `${active.length} 个任务`
            : `${failed.length} 个任务失败`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground"
          aria-label={collapsed ? "展开任务队列" : "收起任务队列"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {running && (
            <div className="flex flex-col gap-1">
              <span className="truncate text-foreground" title={running.title}>
                {running.title}
              </span>
              <Progress
                value={ratio === null ? null : Math.round(ratio * 100)}
                aria-label={`${running.title}进度`}
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

          {queued > 0 && <span>{queued} 个任务等待中</span>}
          {failed.length > 0 && (
            <span className="text-destructive">{failed.length} 个任务失败</span>
          )}

          <Link
            href="/admin/tasks"
            className="text-link underline-offset-2 hover:underline"
          >
            查看任务队列
          </Link>
        </div>
      )}
    </div>
  );
}
