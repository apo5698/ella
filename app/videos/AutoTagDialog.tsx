"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import VideoLink from "@/components/VideoLink";
import AcceptButton from "@/components/AcceptButton";
import { Code } from "@/components/Code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { AutoTagSuggestionList } from "@/components/tags/AutoTagSuggestionList";
import {
  autoTagSuggestionKey,
  type AutoTagStrategy,
  type AutoTagSuggestion,
} from "@/lib/autoTagging";
import { SeriesBadge, TagBadge } from "@/components/tags/TagBadge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";

type ScanEvent =
  | { kind: "start"; total: number }
  | {
      kind: "progress";
      processed: number;
      total: number;
      suggestions: AutoTagSuggestion[];
    }
  | { kind: "done"; processed: number; total: number }
  | { kind: "error"; error: string };

type SuggestionGroup = {
  videoId: number;
  videoTitle: string;
  filename: string;
  thumbnail: string | null;
  suggestions: AutoTagSuggestion[];
};

export default function AutoTagDialog({
  onCommitted,
}: {
  onCommitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [filenamePrefix, setFilenamePrefix] = useState(true);
  const [filenameManualTag, setFilenameManualTag] = useState(true);
  const [filenameRegex, setFilenameRegex] = useState(false);
  const [regexPattern, setRegexPattern] = useState("");
  const [regexHadValue, setRegexHadValue] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [suggestions, setSuggestions] = useState<AutoTagSuggestion[]>([]);
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [error, setError] = useState("");
  const scanController = useRef<AbortController | null>(null);
  const previousStandardStrategies = useRef({
    filenamePrefix: true,
    filenameManualTag: true,
  });

  const regexValidation = useMemo(() => {
    if (!filenameRegex) return { error: "", valid: false };
    if (!regexPattern.trim()) {
      return {
        error: regexHadValue ? "请输入正则表达式" : "",
        valid: false,
      };
    }
    try {
      new RegExp(regexPattern.trim(), "u");
      return { error: "", valid: true };
    } catch {
      return { error: "正则表达式无效", valid: false };
    }
  }, [filenameRegex, regexHadValue, regexPattern]);

  useEffect(
    () => () => {
      scanController.current?.abort();
    },
    [],
  );

  const groups = useMemo(() => {
    const grouped = new Map<number, SuggestionGroup>();
    for (const suggestion of suggestions) {
      const existing = grouped.get(suggestion.videoId);
      if (existing) {
        existing.suggestions.push(suggestion);
      } else {
        grouped.set(suggestion.videoId, {
          videoId: suggestion.videoId,
          videoTitle: suggestion.videoTitle,
          filename: suggestion.filename,
          thumbnail: suggestion.thumbnail,
          suggestions: [suggestion],
        });
      }
    }
    return [...grouped.values()];
  }, [suggestions]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && running) {
      scanController.current?.abort();
      setRunning(false);
    }
    setOpen(nextOpen);
  }

  function changeFilenameRegex(checked: boolean) {
    if (checked) {
      previousStandardStrategies.current = {
        filenamePrefix,
        filenameManualTag,
      };
      setFilenamePrefix(false);
      setFilenameManualTag(false);
    } else {
      setFilenamePrefix(previousStandardStrategies.current.filenamePrefix);
      setFilenameManualTag(
        previousStandardStrategies.current.filenameManualTag,
      );
    }
    setFilenameRegex(checked);
  }

  function addSuggestions(incoming: AutoTagSuggestion[]) {
    if (incoming.length === 0) return;
    setSuggestions((current) => {
      const byKey = new Map(
        current.map((suggestion) => [
          autoTagSuggestionKey(suggestion),
          suggestion,
        ]),
      );
      for (const suggestion of incoming)
        byKey.set(autoTagSuggestionKey(suggestion), suggestion);
      return [...byKey.values()];
    });
    setFoundCount((count) => count + incoming.length);
  }

  function applyScanEvent(event: ScanEvent) {
    if (event.kind === "start") {
      setTotal(event.total);
      return;
    }
    if (event.kind === "progress") {
      setProcessed(event.processed);
      setTotal(event.total);
      addSuggestions(event.suggestions);
      return;
    }
    if (event.kind === "done") {
      setProcessed(event.processed);
      setTotal(event.total);
      setCompleted(true);
      return;
    }
    throw new Error(event.error);
  }

  async function startScan() {
    if (
      running ||
      (filenameRegex
        ? !regexValidation.valid
        : !filenamePrefix && !filenameManualTag)
    ) {
      return;
    }

    const controller = new AbortController();
    scanController.current = controller;
    setRunning(true);
    setStarted(true);
    setCompleted(false);
    setProcessed(0);
    setTotal(0);
    setFoundCount(0);
    setSuggestions([]);
    setError("");

    try {
      const strategies: AutoTagStrategy[] = [];
      if (filenameRegex) {
        strategies.push("filename-regex");
      } else {
        if (filenamePrefix) strategies.push("filename-prefix");
        if (filenameManualTag) strategies.push("filename-manual-tag");
      }
      const response = await fetch("/api/auto-tags/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategies,
          regexPattern: filenameRegex ? regexPattern.trim() : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "自动标记失败");
      }
      if (!response.body) throw new Error("浏览器无法读取扫描进度");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) applyScanEvent(JSON.parse(line) as ScanEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) applyScanEvent(JSON.parse(buffer) as ScanEvent);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") {
        setError((cause as Error).message);
      }
    } finally {
      if (scanController.current === controller) scanController.current = null;
      setRunning(false);
    }
  }

  function drop(selected: AutoTagSuggestion[]) {
    const reviewed = new Set(selected.map(autoTagSuggestionKey));
    setSuggestions((current) =>
      current.filter(
        (suggestion) => !reviewed.has(autoTagSuggestionKey(suggestion)),
      ),
    );
  }

  function stopReviewing(keys: string[]) {
    setReviewing((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
  }

  async function postAccept(
    group: SuggestionGroup,
    selected: AutoTagSuggestion[],
  ): Promise<string[]> {
    const response = await fetch("/api/auto-tags/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: group.videoId,
        suggestions: selected.map(
          ({ name, strategy, regexPattern: suggestionPattern }) => ({
            name,
            strategy,
            regexPattern:
              strategy === "filename-regex" ? suggestionPattern : undefined,
          }),
        ),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "审核失败");
    return data.names as string[];
  }

  async function accept(group: SuggestionGroup, selected: AutoTagSuggestion[]) {
    const keys = selected.map(autoTagSuggestionKey);
    setReviewing((current) => new Set([...current, ...keys]));

    try {
      const names = await postAccept(group, selected);
      drop(selected);
      toast.success(`已接受 ${names.length} 项建议`);
      onCommitted();
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      stopReviewing(keys);
    }
  }

  /**
   * One request per video, in order. A video whose request fails keeps its
   * suggestions on the list.
   */
  async function acceptAll() {
    const pending = groups;
    if (pending.length === 0) return;

    const keys = suggestions.map(autoTagSuggestionKey);
    setAcceptingAll(true);
    setReviewing((current) => new Set([...current, ...keys]));

    const applied: AutoTagSuggestion[] = [];
    let accepted = 0;
    let failures = 0;
    let firstError = "";

    for (const group of pending) {
      try {
        accepted += (await postAccept(group, group.suggestions)).length;
        applied.push(...group.suggestions);
      } catch (cause) {
        failures += 1;
        if (!firstError) firstError = (cause as Error).message;
      }
    }

    drop(applied);
    stopReviewing(keys);
    setAcceptingAll(false);

    if (accepted > 0) {
      toast.success(`已接受 ${accepted} 项建议`);
      onCommitted();
    }
    if (failures > 0) {
      toast.error(`${failures} 个视频的建议未接受：${firstError}`);
    }
  }

  /** Nothing is written: a later scan is free to suggest it again. */
  function skip(selected: AutoTagSuggestion[]) {
    drop(selected);
    toast.success(`已跳过 ${selected.length} 项建议`);
  }

  return (
    <>
      <Button
        className="bg-linear-to-r from-automation-from to-automation-to text-automation-foreground shadow-sm hover:brightness-110 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Sparkles data-icon="inline-start" />
        自动标记
        {suggestions.length > 0 && (
          <Badge className="bg-automation-foreground/20 text-automation-foreground">
            {suggestions.length}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="flex max-h-5/6 flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>自动标记</DialogTitle>
            <DialogDescription>
              扫描只生成临时建议，不会自动应用到视频
            </DialogDescription>
          </DialogHeader>

          <FieldSet disabled={running}>
            <FieldGroup data-slot="checkbox-group">
              <Field
                orientation="horizontal"
                data-disabled={filenameRegex || running || undefined}
              >
                <Checkbox
                  id="filename-prefix-strategy"
                  checked={filenamePrefix}
                  disabled={filenameRegex || running}
                  onCheckedChange={(checked) =>
                    setFilenamePrefix(checked === true)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="filename-prefix-strategy">
                    前缀匹配
                  </FieldLabel>
                  <FieldDescription>
                    当视频名包含
                    <HoverCard>
                      <HoverCardTrigger
                        className="decoration-dotted"
                        delay={100}
                        closeDelay={200}
                      >
                        括号
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="top"
                        align="start"
                        className="flex flex-col gap-2"
                      >
                        <div>
                          <span className="font-medium">中文括号</span>
                          <ul className="list-inside list-disc">
                            <li>（）</li>
                            <li>【】</li>
                          </ul>
                        </div>
                        <Separator />
                        <div>
                          <span className="font-medium">英文括号</span>
                          <ul className="list-inside list-disc">
                            <li>()</li>
                            <li>[]</li>
                          </ul>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    环绕的系列名称时，推荐此&nbsp;
                    <SeriesBadge>系列标签</SeriesBadge>
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field
                orientation="horizontal"
                data-disabled={filenameRegex || running || undefined}
              >
                <Checkbox
                  id="filename-manual-tag-strategy"
                  checked={filenameManualTag}
                  disabled={filenameRegex || running}
                  onCheckedChange={(checked) =>
                    setFilenameManualTag(checked === true)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="filename-manual-tag-strategy">
                    关键词匹配
                  </FieldLabel>
                  <FieldDescription>
                    当视频名包含已有的已审核标签时，推荐此&nbsp;
                    <TagBadge source={"manual"}>已审核标签</TagBadge>
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="filename-regex-strategy"
                  checked={filenameRegex}
                  onCheckedChange={(checked) =>
                    changeFilenameRegex(checked === true)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="filename-regex-strategy">
                    正则表达式匹配
                  </FieldLabel>
                  <FieldDescription>
                    当视频名匹配正则表达式时，推荐第一个<Code>(捕获组)</Code>
                    作为标签
                  </FieldDescription>
                  <Field
                    className="mt-1"
                    data-disabled={!filenameRegex || running || undefined}
                    data-invalid={
                      (filenameRegex && Boolean(regexValidation.error)) ||
                      undefined
                    }
                  >
                    <FieldLabel
                      htmlFor="filename-regex-pattern"
                      className="sr-only"
                    >
                      正则表达式
                    </FieldLabel>
                    <Input
                      id="filename-regex-pattern"
                      className="font-mono"
                      value={regexPattern}
                      placeholder="^【([^】]+)】"
                      disabled={!filenameRegex || running}
                      aria-invalid={
                        (filenameRegex && Boolean(regexValidation.error)) ||
                        undefined
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value) setRegexHadValue(true);
                        setRegexPattern(value);
                      }}
                    />
                    {filenameRegex && regexValidation.error && (
                      <FieldError>{regexValidation.error}</FieldError>
                    )}
                  </Field>
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>

          {started && (
            <Progress value={processed} max={Math.max(total, 1)}>
              <ProgressLabel>{running ? "正在扫描" : "扫描进度"}</ProgressLabel>
              <span className="ml-auto text-xs/relaxed tabular-nums text-muted-foreground">
                {processed} / {total}
              </span>
            </Progress>
          )}

          {error && <p className="text-destructive">{error}</p>}

          {suggestions.length > 0 ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">待审核</span>
                <span className="text-muted-foreground">
                  {groups.length} 个视频，{suggestions.length} 项建议
                </span>
              </div>
              <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden pr-3 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
                <ItemGroup className="min-w-0">
                  {groups.map((group) => {
                    const groupKeys =
                      group.suggestions.map(autoTagSuggestionKey);
                    const groupBusy = groupKeys.some((key) =>
                      reviewing.has(key),
                    );
                    return (
                      <Item
                        key={group.videoId}
                        role="listitem"
                        variant="outline"
                        className="min-w-0 items-start overflow-hidden"
                      >
                        <ItemMedia variant="image">
                          {group.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={group.thumbnail} alt="" />
                          ) : (
                            <Sparkles />
                          )}
                        </ItemMedia>
                        <ItemContent className="min-w-0 basis-0 overflow-hidden">
                          <ItemTitle className="max-w-full">
                            <VideoLink
                              href={`/video/${group.videoId}`}
                              target="_blank"
                              rel="noreferrer"
                              title={group.videoTitle}
                              className="min-w-0 truncate pb-px underline-offset-2 hover:underline"
                            >
                              {group.videoTitle}
                            </VideoLink>
                          </ItemTitle>
                          <ItemDescription className="max-w-full truncate">
                            {group.filename}
                          </ItemDescription>
                          <AutoTagSuggestionList
                            suggestions={group.suggestions}
                            busyKeys={reviewing}
                            onAccept={(suggestion) =>
                              accept(group, [suggestion])
                            }
                            onSkip={(suggestion) => skip([suggestion])}
                          />
                        </ItemContent>
                        <ItemActions className="basis-full flex-wrap justify-end pl-10">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-success hover:bg-success/10 hover:text-success"
                            disabled={groupBusy}
                            onClick={() => accept(group, group.suggestions)}
                          >
                            <Check data-icon="inline-start" />
                            全部接受
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={groupBusy}
                            onClick={() => skip(group.suggestions)}
                          >
                            <X data-icon="inline-start" />
                            全部跳过
                          </Button>
                        </ItemActions>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </ScrollArea>
            </div>
          ) : completed ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {foundCount > 0 ? "所有建议均已审核" : "没有新的建议"}
                </EmptyTitle>
                <EmptyDescription>
                  {foundCount > 0
                    ? "本次扫描发现的建议均已接受或跳过"
                    : "匹配的标签与系列可能已经存在"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : running ? (
            <p className="text-muted-foreground">发现的建议会立即显示在这里</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => changeOpen(false)}>
              关闭
            </Button>
            {suggestions.length > 0 && (
              <AcceptButton
                disabled={running || acceptingAll}
                onClick={acceptAll}
              >
                {acceptingAll ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                接受全部建议
              </AcceptButton>
            )}
            <Button
              disabled={
                running ||
                (filenameRegex
                  ? !regexValidation.valid
                  : !filenamePrefix && !filenameManualTag)
              }
              onClick={startScan}
            >
              {running ? (
                <Spinner data-icon="inline-start" />
              ) : started ? (
                <RotateCw data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {running ? "扫描中" : started ? "重新扫描" : "开始"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
