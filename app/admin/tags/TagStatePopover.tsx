"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { toast } from "sonner";
import { TagBadge } from "@/components/tags/TagBadge";
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
import { Dot } from "@/components/ui/dot";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field, FieldLabel } from "@/components/ui/field";
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
  const t = useTranslations("TagState");
  const labels = useTranslations("TagLabels");
  const states = state === "automatic" ? ALL_STATES : HUMAN_STATES;
  const [open, setOpen] = useState(false);
  const [pendingState, setPendingState] = useState<TagReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedState = pendingState ?? state;
  const changed = selectedState !== state;
  const categoryBlocked = state !== "category" && directVideoCount > 0;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setPendingState(null);
  }

  async function changeState() {
    const next = selectedState;
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
        toast.error(data.error ?? t("failed"));
        return;
      }

      await onChanged();
      setPendingState(null);
      setOpen(false);
    } catch {
      toast.error(t("failed"));
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
            aria-label={labels("tagState", {
              name,
              state: labels(TAG_STATE_LABEL[state]),
            })}
            className="flex min-h-5 pointer-coarse:py-3 shrink-0 cursor-pointer items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Dot
            aria-hidden="true"
            className={cn(
              "transition-transform hover:scale-125",
              TAG_STATE_DOT_STYLE[state],
            )}
          />
        </span>
        <TagBadge state={state}>{name}</TagBadge>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-max max-w-[calc(100dvw-2rem)] [&_li]:[overflow-wrap:anywhere]"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>{t("title")}</PopoverTitle>
          <PopoverDescription>{t("description")}</PopoverDescription>
        </PopoverHeader>
        <RadioGroup
          aria-label={t("statusFor", { name })}
          value={selectedState}
          onValueChange={(value) => setPendingState(value as TagReviewState)}
          disabled={busy}
        >
          {states.map((option) => (
            <Field key={option} orientation="horizontal">
              <RadioGroupItem
                id={`tag-${tagId}-${option}`}
                value={option}
                disabled={option === "category" && categoryBlocked}
              />
              <FieldLabel
                className="whitespace-nowrap"
                htmlFor={`tag-${tagId}-${option}`}
              >
                <Dot
                  aria-hidden="true"
                  className={TAG_STATE_DOT_STYLE[option]}
                />
                {labels(TAG_STATE_LABEL[option])}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        {categoryBlocked && (
          <p className="text-sm text-muted-foreground">
            {t("categoryBlocked")}
          </p>
        )}

        {selectedState !== "automatic" &&
          (changed || selectedState === "category") && (
            <TagImpactAnalysis
              className="[container-type:normal]"
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
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              !changed ||
              busy ||
              (selectedState === "category" && categoryBlocked)
            }
            onClick={() => changeState()}
          >
            {t("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
