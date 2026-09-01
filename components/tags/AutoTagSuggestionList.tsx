"use client";

import { Check, X } from "lucide-react";
import AcceptButton from "@/components/AcceptButton";
import { Button } from "@/components/ui/button";
import { SeriesBadge, TagBadge } from "@/components/tags/TagBadge";
import {
  autoTagSuggestionKey,
  type AutoTagSuggestion,
} from "@/lib/autoTagging";

export function AutoTagSuggestionList({
  suggestions,
  busyKeys,
  disabled,
  onAccept,
  onSkip,
}: {
  suggestions: AutoTagSuggestion[];
  busyKeys?: ReadonlySet<string>;
  disabled?: boolean;
  onAccept: (suggestion: AutoTagSuggestion) => void;
  onSkip: (suggestion: AutoTagSuggestion) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {suggestions.map((suggestion) => {
        const key = autoTagSuggestionKey(suggestion);
        const busy = disabled || busyKeys?.has(key);
        // A series suggestion carries the same badge as the one on the video
        // page, so the two kinds stay apart in one list.
        const label = `${suggestion.kind === "series" ? "系列" : "标签"}"${suggestion.name}"`;
        return (
          <div key={key} className="inline-flex items-center gap-0.5">
            {suggestion.kind === "series" ? (
              <SeriesBadge>{suggestion.name}</SeriesBadge>
            ) : (
              <TagBadge source={"manual"}>{suggestion.name}</TagBadge>
            )}
            <AcceptButton
              type="button"
              size="icon-xs"
              disabled={busy}
              title={`接受${label}`}
              aria-label={`接受${label}`}
              onClick={() => onAccept(suggestion)}
            >
              <Check />
            </AcceptButton>
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              disabled={busy}
              title={`跳过${label}`}
              aria-label={`跳过${label}`}
              onClick={() => onSkip(suggestion)}
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
