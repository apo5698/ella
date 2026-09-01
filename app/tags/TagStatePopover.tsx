"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TAG_STATE_DOT_STYLE,
  TAG_STATE_LABEL,
} from "@/components/tags/tag-presentation";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { TagReviewState } from "@/lib/types";
import TagImpactAnalysis from "./TagImpactAnalysis";

const ALL_STATES: TagReviewState[] = [
  "excluded",
  "automatic",
  "approved",
  "category",
];
const HUMAN_STATES = ALL_STATES.filter((state) => state !== "automatic");

export default function TagStatePopover({
  tagId,
  name,
  state,
  directVideoCount,
  onChanged,
}: {
  tagId: number;
  name: string;
  state: TagReviewState;
  directVideoCount: number;
  onChanged: () => Promise<void>;
}) {
  const states = useMemo(
    () => (state === "automatic" ? ALL_STATES : HUMAN_STATES),
    [state],
  );
  const stateIndex = states.indexOf(state);
  const [open, setOpen] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const value = pendingIndex ?? stateIndex;
  const selectedState = states[value];
  const changed = selectedState !== state;
  const categoryBlocked = state !== "category" && directVideoCount > 0;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setPendingIndex(null);
  }

  async function changeState(index: number) {
    const next = states[index];
    if (
      !next ||
      next === state ||
      busy ||
      (next === "category" && categoryBlocked)
    )
      return;

    setBusy(true);
    try {
      const response = await fetch(`/api/tags/${tagId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "无法更改标签状态");
        return;
      }

      await onChanged();
      setPendingIndex(null);
      setOpen(false);
    } catch {
      toast.error("无法更改标签状态");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            data-row-control=""
            type="button"
            aria-label={`${name}：${TAG_STATE_LABEL[state]}`}
            className="flex size-5 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full transition-transform hover:scale-125",
            TAG_STATE_DOT_STYLE[state],
          )}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>标签状态</PopoverTitle>
          <PopoverDescription>选择后预览，点击应用生效</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-2 pb-1">
          <span id={`tag-state-${tagId}-label`} className="sr-only">
            {name}的状态
          </span>
          <Slider
            min={0}
            max={states.length - 1}
            step={1}
            value={[value]}
            disabled={busy}
            onValueChange={(next) =>
              setPendingIndex(
                typeof next === "number" ? next : (next[0] ?? stateIndex),
              )
            }
            className="pr-10"
            aria-labelledby={`tag-state-${tagId}-label`}
          />
          <div className="mr-10 px-1.5">
            <div className="relative h-5 text-xs text-foreground">
              {states.map((option, index) => (
                <button
                  type="button"
                  key={option}
                  data-row-control=""
                  className={cn(
                    "absolute top-0 flex cursor-pointer items-center gap-1 whitespace-nowrap",
                    option === selectedState && "text-foreground",
                  )}
                  style={{ left: `${(index / (states.length - 1)) * 100}%` }}
                  onClick={() => setPendingIndex(index)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 -translate-x-1/2 rounded-full",
                      TAG_STATE_DOT_STYLE[option],
                    )}
                  />
                  {TAG_STATE_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedState !== "automatic" &&
          (changed || selectedState === "category") && (
            <TagImpactAnalysis
              request={{ action: "state", id: tagId, state: selectedState }}
              showVideos={false}
            />
          )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              !changed ||
              busy ||
              (selectedState === "category" && categoryBlocked)
            }
            onClick={() => changeState(value)}
          >
            应用
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
