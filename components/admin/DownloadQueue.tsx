"use client";

import VideoLink from "@/components/VideoLink";
import AcceptButton from "@/components/AcceptButton";
import { useRef, useState, type ComponentType } from "react";
import { useForm } from "@tanstack/react-form";
import { diffChars, type Change } from "diff";
import {
  Check,
  CheckCircle2,
  FileDown,
  Film,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AutoTagSuggestionList } from "@/components/tags/AutoTagSuggestionList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  autoTagSuggestionKey,
  type AutoTagSuggestion,
} from "@/lib/autoTagging";
import type { VideoRef } from "@/lib/duplicates";
import type {
  DownloadFailure,
  DownloadProgressPresentation,
  DownloadStreamEvent,
  ImportedDownloadResult,
} from "@/lib/utilities/downloadTypes";
import { cn } from "@/lib/utils";

type SchemaIssue = { message: string; path?: PropertyKey[] };
type Schema<TFields> = {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TFields }
    | { success: false; error: { issues: SchemaIssue[] } };
};

export type DownloadFieldErrors<TFields> = Partial<
  Record<keyof TFields, Array<{ message?: string }>>
>;

export type DownloadSourceFieldsProps<TFields> = {
  entryId: number;
  value: TFields;
  disabled: boolean;
  errors: DownloadFieldErrors<TFields>;
  hasConflict: boolean;
  onChange: <TKey extends keyof TFields>(
    field: TKey,
    value: TFields[TKey],
  ) => void;
};

type QueueEntry<TFields> = { id: number; fields: TFields };
type EntryState<TProgress> = {
  status: "idle" | "pending" | "success" | "error";
  error?: string;
  errorVideo?: VideoRef & { score?: number };
  errorReason?: DownloadFailure["reason"];
  result?: ImportedDownloadResult;
  progress?: TProgress;
  reviewingAutoTags?: boolean;
};

type DownloadQueueProps<TFields extends object, TProgress> = {
  endpoint: string;
  createFields: () => TFields;
  schema: Schema<TFields>;
  fields: ComponentType<DownloadSourceFieldsProps<TFields>>;
  getRequestedName: (fields: TFields) => string;
  presentProgress: (progress: TProgress) => DownloadProgressPresentation;
  toRequest?: (fields: TFields) => unknown;
  title?: string;
  description?: string;
};

const IDLE_STATE = { status: "idle" } as const;

function DiffName({ parts }: { parts: Change[] }) {
  return parts.map((part, index) => {
    return part.added || part.removed ? (
      <mark
        key={index}
        className={cn(
          "rounded-sm px-0.5",
          part.removed
            ? "bg-destructive/15 text-destructive"
            : "bg-success/15 text-success",
        )}
      >
        {part.value}
      </mark>
    ) : (
      part.value
    );
  });
}

function SimilarNameConflict({
  requestedName,
  match,
}: {
  requestedName: string;
  match: VideoRef & { score: number };
}) {
  const diff = diffChars(match.title, requestedName);
  return (
    <Alert variant="destructive">
      <AlertTitle className="flex items-center gap-2">
        发现相似视频
        <Badge variant="destructive" className="tabular-nums">
          相似度 {Math.round(match.score * 100)}%
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <ItemGroup className="text-foreground">
          <Item role="listitem" variant="muted" size="sm">
            <ItemMedia variant="icon">
              <Film />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>已有视频</ItemTitle>
              <ItemDescription className="line-clamp-none break-all">
                <VideoLink href={`/video/${match.id}`} target="_blank">
                  {match.title}
                </VideoLink>
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item role="listitem" variant="muted" size="sm">
            <ItemMedia variant="icon">
              <FileDown />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>待下载视频</ItemTitle>
              <ItemDescription className="line-clamp-none break-all">
                <DiffName parts={diff} />
              </ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </AlertDescription>
    </Alert>
  );
}

function issuesByField<TFields extends object>(issues: SchemaIssue[]) {
  const errors: DownloadFieldErrors<TFields> = {};
  for (const issue of issues) {
    const field = issue.path?.[0] as keyof TFields | undefined;
    if (field === undefined) continue;
    (errors[field] ??= []).push({ message: issue.message });
  }
  return errors;
}

export function DownloadQueue<TFields extends object, TProgress>({
  endpoint,
  createFields,
  schema,
  fields: SourceFields,
  getRequestedName,
  presentProgress,
  toRequest = (fields) => fields,
  title = "下载视频",
  description = "所有下载会并行处理，完成后自动录入媒体库",
}: DownloadQueueProps<TFields, TProgress>) {
  const nextId = useRef(2);
  const [entryStates, setEntryStates] = useState<
    Record<number, EntryState<TProgress>>
  >({});
  const [entryErrors, setEntryErrors] = useState<
    Record<number, DownloadFieldErrors<TFields>>
  >({});
  const [running, setRunning] = useState(false);
  const form = useForm({
    defaultValues: {
      entries: [{ id: 1, fields: createFields() }] as QueueEntry<TFields>[],
    },
    onSubmit: async ({ value }) => submit(value.entries),
  });

  function updateEntryState(id: number, patch: Partial<EntryState<TProgress>>) {
    setEntryStates((current) => ({
      ...current,
      [id]: { ...(current[id] ?? IDLE_STATE), ...patch },
    }));
  }

  function resetEntryState(id: number) {
    updateEntryState(id, {
      status: "idle",
      error: undefined,
      errorVideo: undefined,
      errorReason: undefined,
      result: undefined,
      progress: undefined,
      reviewingAutoTags: undefined,
    });
  }

  function validateEntry(entry: QueueEntry<TFields>) {
    const parsed = schema.safeParse(entry.fields);
    setEntryErrors((current) => ({
      ...current,
      [entry.id]: parsed.success
        ? {}
        : issuesByField<TFields>(parsed.error.issues),
    }));
    return parsed.success;
  }

  function dropAutoTagSuggestions(
    entryId: number,
    suggestions: AutoTagSuggestion[],
  ) {
    const reviewed = new Set(suggestions.map(autoTagSuggestionKey));
    setEntryStates((current) => {
      const state = current[entryId];
      if (!state?.result) return current;
      return {
        ...current,
        [entryId]: {
          ...state,
          result: {
            ...state.result,
            autoTagSuggestions: state.result.autoTagSuggestions.filter(
              (suggestion) => !reviewed.has(autoTagSuggestionKey(suggestion)),
            ),
          },
        },
      };
    });
  }

  async function acceptAutoTags(
    entryId: number,
    suggestions: AutoTagSuggestion[],
  ) {
    const videoId = entryStates[entryId]?.result?.videoId;
    if (!videoId || suggestions.length === 0) return;
    updateEntryState(entryId, { reviewingAutoTags: true });
    try {
      const response = await fetch("/api/auto-tags/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          suggestions: suggestions.map(({ name, strategy, regexPattern }) => ({
            name,
            strategy,
            regexPattern,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "审核失败");
      dropAutoTagSuggestions(entryId, suggestions);
      toast.success(`已接受 ${data.names.length} 项建议`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      updateEntryState(entryId, { reviewingAutoTags: false });
    }
  }

  function skipAutoTags(entryId: number, suggestions: AutoTagSuggestion[]) {
    dropAutoTagSuggestions(entryId, suggestions);
    toast.success(`已跳过 ${suggestions.length} 项建议`);
  }

  async function downloadEntry(entry: QueueEntry<TFields>) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequest(entry.fields)),
      });
      if (!response.ok) {
        const failure = (await response
          .json()
          .catch(() => ({}))) as Partial<DownloadFailure>;
        updateEntryState(entry.id, {
          status: "error",
          error: failure.error || "下载失败",
          errorVideo: failure.video ?? undefined,
          errorReason: failure.reason,
          result: undefined,
          progress: undefined,
        });
        return;
      }
      if (!response.body) throw new Error("浏览器无法读取下载进度");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: ImportedDownloadResult | undefined;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DownloadStreamEvent<TProgress>;
          if (event.kind === "progress")
            updateEntryState(entry.id, { progress: event.progress });
          else if (event.kind === "error") {
            updateEntryState(entry.id, {
              status: "error",
              error: event.error,
              errorVideo: event.video ?? undefined,
              errorReason: undefined,
              result: undefined,
              progress: undefined,
            });
            return;
          } else result = event.result;
        }
        if (done) break;
      }
      if (!result) throw new Error("下载中断，请重试");
      updateEntryState(entry.id, {
        status: "success",
        result,
        error: undefined,
        errorVideo: undefined,
        errorReason: undefined,
        progress: undefined,
      });
    } catch (cause) {
      updateEntryState(entry.id, {
        status: "error",
        error: cause instanceof Error ? cause.message : "下载失败",
        errorVideo: undefined,
        errorReason: undefined,
        result: undefined,
        progress: undefined,
      });
    }
  }

  async function submit(entries: QueueEntry<TFields>[]) {
    if (!entries.map(validateEntry).every(Boolean)) return;
    const pendingEntries = entries.filter(
      (entry) => entryStates[entry.id]?.status !== "success",
    );
    if (pendingEntries.length === 0) return;
    setRunning(true);
    setEntryStates((current) =>
      Object.fromEntries(
        entries.map((entry) => [
          entry.id,
          current[entry.id]?.status === "success"
            ? current[entry.id]
            : { status: "pending" as const },
        ]),
      ),
    );
    await Promise.all(pendingEntries.map(downloadEntry));
    setRunning(false);
  }

  function removeEntry(index: number, id: number) {
    void form.removeFieldValue("entries", index);
    setEntryStates((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEntryErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form
        noValidate
        className="flex flex-col gap-(--card-spacing)"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <CardContent>
          <ItemGroup>
            <form.Field name="entries" mode="array">
              {(entriesField) => {
                const entries = entriesField.state
                  .value as unknown as QueueEntry<TFields>[];
                const setEntries = entriesField.handleChange as unknown as (
                  value: QueueEntry<TFields>[],
                ) => void;
                return entries.map((entry, index) => {
                  const state = entryStates[entry.id] ?? IDLE_STATE;
                  const pending = state.status === "pending";
                  const progress = state.progress
                    ? presentProgress(state.progress)
                    : { label: "准备下载", percent: null };
                  return (
                    <Item key={entry.id} role="listitem" variant="outline">
                      <ItemHeader>
                        <ItemTitle>下载 {index + 1}</ItemTitle>
                        <ItemActions>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`移除下载 ${index + 1}`}
                            disabled={entries.length <= 1 || running}
                            onClick={() => removeEntry(index, entry.id)}
                          >
                            <Trash2 />
                          </Button>
                        </ItemActions>
                      </ItemHeader>
                      <ItemContent className="gap-4">
                        <SourceFields
                          entryId={entry.id}
                          value={entry.fields}
                          disabled={pending}
                          errors={entryErrors[entry.id] ?? {}}
                          hasConflict={
                            state.status === "error" &&
                            state.errorReason !== undefined
                          }
                          onChange={(field, value) => {
                            const fields = { ...entry.fields, [field]: value };
                            setEntries(
                              entries.map((item) =>
                                item.id === entry.id
                                  ? { ...item, fields }
                                  : item,
                              ),
                            );
                            resetEntryState(entry.id);
                            if (entryErrors[entry.id])
                              validateEntry({ ...entry, fields });
                          }}
                        />
                      </ItemContent>
                      {pending && (
                        <ItemFooter>
                          {progress.percent === null ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Spinner />
                              {progress.label}
                              {progress.detail && (
                                <span className="tabular-nums">
                                  {progress.detail}
                                </span>
                              )}
                            </span>
                          ) : (
                            <Progress
                              value={progress.percent}
                              max={100}
                              className="w-full"
                            >
                              <ProgressLabel>{progress.label}</ProgressLabel>
                              <span className="ml-auto text-xs/relaxed tabular-nums text-muted-foreground">
                                {progress.detail ?? `${progress.percent}%`}
                              </span>
                            </Progress>
                          )}
                        </ItemFooter>
                      )}
                      {state.status === "error" && (
                        <ItemFooter>
                          {state.errorReason === "similar" &&
                          state.errorVideo?.score !== undefined ? (
                            <SimilarNameConflict
                              requestedName={getRequestedName(entry.fields)}
                              match={
                                state.errorVideo as VideoRef & { score: number }
                              }
                            />
                          ) : (
                            <Alert variant="destructive">
                              <AlertTitle>下载失败</AlertTitle>
                              <AlertDescription>
                                {state.error}
                                {state.errorVideo && (
                                  <>
                                    {" "}
                                    <VideoLink
                                      href={`/video/${state.errorVideo.id}`}
                                    >
                                      查看
                                    </VideoLink>
                                  </>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                        </ItemFooter>
                      )}
                      {state.status === "success" && state.result && (
                        <ItemFooter className="flex-col items-stretch">
                          <Alert>
                            <CheckCircle2 />
                            <AlertTitle>视频已录入</AlertTitle>
                            <AlertDescription>
                              <VideoLink
                                href={`/video/${state.result.videoId}`}
                              >
                                {state.result.title}
                              </VideoLink>
                              {state.result.truncated && (
                                <span>（磁盘文件名已截断）</span>
                              )}
                              {state.result.duplicates.length > 0 && (
                                <span>
                                  时长与文件大小接近的视频：
                                  {state.result.duplicates.map((match) => (
                                    <VideoLink
                                      key={match.id}
                                      href={`/video/${match.id}`}
                                    >{`"${match.title}"`}</VideoLink>
                                  ))}
                                </span>
                              )}
                              {state.result.similar.length > 0 && (
                                <span>
                                  名称与以下视频相近：
                                  {state.result.similar.map((match) => (
                                    <VideoLink
                                      key={match.id}
                                      href={`/video/${match.id}`}
                                    >{`"${match.title}"`}</VideoLink>
                                  ))}
                                </span>
                              )}
                            </AlertDescription>
                          </Alert>
                          {state.result.autoTagSuggestions.length > 0 && (
                            <Alert>
                              <Sparkles />
                              <AlertTitle>自动标记建议</AlertTitle>
                              <AlertDescription className="flex flex-col gap-2">
                                <AutoTagSuggestionList
                                  suggestions={state.result.autoTagSuggestions}
                                  disabled={state.reviewingAutoTags}
                                  onAccept={(suggestion) =>
                                    void acceptAutoTags(entry.id, [suggestion])
                                  }
                                  onSkip={(suggestion) =>
                                    skipAutoTags(entry.id, [suggestion])
                                  }
                                />
                                <div className="flex justify-end gap-1">
                                  <AcceptButton
                                    type="button"
                                    size="sm"
                                    disabled={state.reviewingAutoTags}
                                    onClick={() =>
                                      void acceptAutoTags(
                                        entry.id,
                                        state.result!.autoTagSuggestions,
                                      )
                                    }
                                  >
                                    <Check data-icon="inline-start" />
                                    全部接受
                                  </AcceptButton>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={state.reviewingAutoTags}
                                    onClick={() =>
                                      skipAutoTags(
                                        entry.id,
                                        state.result!.autoTagSuggestions,
                                      )
                                    }
                                  >
                                    <X data-icon="inline-start" />
                                    全部跳过
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                        </ItemFooter>
                      )}
                    </Item>
                  );
                });
              }}
            </form.Field>
          </ItemGroup>
        </CardContent>
        <CardFooter className="justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => {
              const pushEntry = form.pushFieldValue as unknown as (
                field: "entries",
                value: QueueEntry<TFields>,
              ) => void;
              pushEntry("entries", {
                id: nextId.current++,
                fields: createFields(),
              });
            }}
          >
            <Plus data-icon="inline-start" />
            增加
          </Button>
          <form.Subscribe selector={(state) => state.values.entries}>
            {(entries) => {
              const remaining = entries.filter(
                (entry) => entryStates[entry.id]?.status !== "success",
              ).length;
              return (
                <Button type="submit" disabled={running || remaining === 0}>
                  {running && <Spinner data-icon="inline-start" />}
                  {running
                    ? "下载中"
                    : `开始下载${remaining > 1 ? ` (${remaining})` : ""}`}
                </Button>
              );
            }}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  );
}
