"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { InlineTagBadge } from "@/components/tags/TagBadge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import LocalTime from "@/components/LocalTime";
import { taskRatio, useTaskQueue } from "@/hooks/useTaskQueue";
import { formatDurationText } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/tasks";

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "等待中",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const STATUS_VARIANT: Record<
  TaskStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  queued: "outline",
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  canceled: "outline",
};

const STATUS_CLASS: Partial<Record<TaskStatus, string>> = {
  succeeded: "bg-success/10 text-success",
};

/** How long the task ran, or has been running. */
function elapsed(task: Task, now: number): string | null {
  if (task.startedAt === null) return null;
  const end = task.finishedAt ?? now;
  return formatDurationText((end - task.startedAt) / 1000);
}

function retaggedVideo(task: Task) {
  if (task.kind !== "retag-video") return null;
  try {
    const payload = JSON.parse(task.payload) as {
      videoId?: unknown;
      videoTitle?: unknown;
    };
    if (
      typeof payload.videoId === "number" &&
      typeof payload.videoTitle === "string"
    ) {
      return { id: payload.videoId, title: payload.videoTitle };
    }
  } catch {
    // Keep older persisted task titles readable.
  }
  return null;
}

function promotedTagName(task: Task): string | null {
  if (task.kind !== "promote-tag-source") return null;
  try {
    const name = (JSON.parse(task.payload) as { tagName?: unknown }).tagName;
    if (typeof name === "string") return name;
  } catch {
    // Older persisted tasks only have the display title.
  }
  return task.title.match(/^将"(.+)"转为已审核标签/)?.[1] ?? null;
}

function TaskTitleText({ task }: { task: Task }) {
  const video = retaggedVideo(task);
  if (video) {
    return (
      <>
        重新识别
        <Link
          href={`/video/${video.id}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {video.title}
        </Link>
        的标签
      </>
    );
  }
  const name = promotedTagName(task);
  if (!name) return task.title;
  const count = task.title.match(/（(\d+) 个视频）$/)?.[1];
  return (
    <>
      将<InlineTagBadge state="approved">{name}</InlineTagBadge>
      转为已审核标签{count ? `（${count} 个视频）` : ""}
    </>
  );
}

function TaskResultText({ task }: { task: Task }) {
  if (!task.result) return null;
  const name = promotedTagName(task);
  if (!name) return task.result;
  const prefix = task.result.match(/^(\d+ 个视频上的)/)?.[1] ?? "";
  return (
    <>
      {prefix}
      <InlineTagBadge state="approved">{name}</InlineTagBadge>
      已转为已审核标签
    </>
  );
}

function TaskTiming({ task }: { task: Task }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.status]);

  const duration = elapsed(task, now);
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
      <LocalTime value={task.createdAt} />
      {duration && <span className="tabular-nums">耗时 {duration}</span>}
    </div>
  );
}

export default function TaskList({
  initialTasks,
  initialTotal,
}: {
  initialTasks: Task[];
  initialTotal: number;
}) {
  const queue = useTaskQueue();
  const tasks = queue.connected ? queue.tasks : initialTasks;
  const total = queue.connected ? queue.total : initialTotal;
  const [busy, setBusy] = useState<number | null>(null);

  const finished = tasks.filter(
    (task) => task.status !== "queued" && task.status !== "running",
  );

  async function act(url: string, done: string, id: number | null) {
    setBusy(id);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "操作失败，请重试。");
      toast.success(done);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <>
        <AdminPageHeader title="任务队列" description={`共 ${total} 个任务`} />
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyTitle>队列为空</EmptyTitle>
            <EmptyDescription>后台任务会在此排队执行</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title="任务队列" description={`共 ${total} 个任务`} />
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          {finished.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                act(
                  "/api/tasks/clear",
                  `已清除 ${finished.length} 个任务`,
                  null,
                )
              }
            >
              <Trash2 data-icon="inline-start" />
              清除已结束
            </Button>
          )}
        </div>

        <ItemGroup className="gap-2">
          {tasks.map((task) => {
            const ratio = taskRatio(task);
            return (
              <Item
                key={task.id}
                role="listitem"
                variant="outline"
                className="items-start"
              >
                <ItemContent className="min-w-0 gap-1">
                  <ItemTitle className="flex flex-wrap items-center gap-1">
                    <Badge
                      variant={STATUS_VARIANT[task.status]}
                      className={STATUS_CLASS[task.status]}
                    >
                      {STATUS_LABEL[task.status]}
                    </Badge>
                    <span className="min-w-0 truncate">
                      <TaskTitleText task={task} />
                    </span>
                  </ItemTitle>

                  {task.status === "running" && (
                    <Progress
                      value={ratio === null ? null : Math.round(ratio * 100)}
                      aria-label={`${task.title}进度`}
                      className="gap-1"
                    >
                      {task.total > 0 && (
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {task.processed} / {task.total}
                        </span>
                      )}
                    </Progress>
                  )}

                  {task.result && (
                    <ItemDescription className="max-w-full">
                      <TaskResultText task={task} />
                    </ItemDescription>
                  )}

                  {task.error && (
                    <ItemDescription className="max-w-full text-destructive">
                      {task.error}
                    </ItemDescription>
                  )}
                </ItemContent>

                <div className="ml-auto flex shrink-0 self-stretch flex-col items-end justify-between gap-2">
                  <TaskTiming task={task} />
                  <ItemActions>
                    {(task.status === "queued" ||
                      task.status === "running") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            `/api/tasks/${task.id}/cancel`,
                            task.status === "running"
                              ? "正在停止任务"
                              : "已取消任务",
                            task.id,
                          )
                        }
                      >
                        <X data-icon="inline-start" />
                        取消
                      </Button>
                    )}
                    {(task.status === "failed" ||
                      task.status === "canceled") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            `/api/tasks/${task.id}/retry`,
                            "已重新排队",
                            task.id,
                          )
                        }
                      >
                        <RotateCw data-icon="inline-start" />
                        重试
                      </Button>
                    )}
                  </ItemActions>
                </div>
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    </>
  );
}
