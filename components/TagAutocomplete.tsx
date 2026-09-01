"use client";

import { useEffect, useRef, useState } from "react";
import { Field as FieldPrimitive } from "@base-ui/react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { normalizeName, normalizeNameInput } from "@/lib/names";
import type { Suggestion } from "@/lib/types";
import type { TagReviewState } from "@/lib/types";
import { AliasBadge, SeriesBadge, TagBadge } from "@/components/tags/TagBadge";

/**
 * `alias` is the spelling that matched when it was not the tag's own name.
 * `name` is always what gets added, since a video never carries an alias.
 */
export type Option = {
  /** Absent on a name that does not exist yet. */
  id?: number;
  name: string;
  count: number | null;
  alias?: string | null;
  isNew?: boolean;
  reviewState?: TagReviewState;
};

/**
 * Combobox whose options come from `endpoint` as the user types. Filtering is
 * done server-side (`filter={null}`) so the ranking in lib/suggest.ts decides
 * what surfaces, rather than Base UI's built-in string match.
 *
 * `mode` only changes what happens after a pick: "single" closes the list (one
 * value replaces the previous), "multi" keeps it open for adding several.
 */
export default function TagAutocomplete({
  endpoint,
  mode,
  placeholder,
  disabledNames = [],
  allowCreate = true,
  onSelect,
  className,
  kind = "tag",
  inputId,
}: {
  endpoint: string;
  mode: "single" | "multi";
  placeholder?: string;
  /** Already-chosen names, shown greyed out and not selectable. */
  disabledNames?: string[];
  /**
   * Whether an unmatched entry may be created. Off where the caller needs one
   * of the existing entries, such as choosing a parent tag.
   */
  allowCreate?: boolean;
  /**
   * The picked option travels with the name, so a caller that must tell an
   * existing tag from a new word does not have to ask the server again.
   */
  onSelect: (name: string, option: Option) => void;
  className?: string;
  kind?: "tag" | "series";
  inputId?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const justSelected = useRef(false);

  // Fetched regardless of whether the popup is open: Base UI decides when to
  // open it, so gating the fetch on `open` would leave it with nothing to show.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // The endpoint may already carry a query of its own, so the search
        // term is appended rather than assumed to be the first parameter.
        const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {
        // Aborted or offline: keep showing the previous list.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, endpoint]);

  const disabled = new Set(disabledNames);
  // What entering this text would create.
  const typed = normalizeName(query);
  // An existing alias is not offered as a new tag: it already stands for one,
  // and creating it would put the same idea under two names.
  const canCreate =
    allowCreate &&
    typed.length > 0 &&
    !suggestions.some(
      (s) => s.name.toLowerCase() === typed || s.alias?.toLowerCase() === typed,
    ) &&
    !disabled.has(typed);

  const options: Option[] = [
    ...suggestions.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.count,
      alias: s.alias,
      reviewState: s.reviewState,
    })),
    ...(canCreate
      ? [
          {
            name: typed,
            count: null,
            isNew: true,
            reviewState: "approved" as const,
          },
        ]
      : []),
  ];

  function handleValueChange(next: Option | null) {
    if (!next || disabled.has(next.name)) return;
    onSelect(next.name, next);
    // Base UI echoes the picked label back through onInputValueChange right
    // after this. The pick is shown as a badge instead, so swallow that echo
    // and leave the field empty for the next entry.
    justSelected.current = true;
    setQuery("");
    if (mode === "multi") {
      // Stay open so several tags can be picked without re-focusing.
      requestAnimationFrame(() => setOpen(true));
    }
  }

  function handleInputValueChange(next: string) {
    if (justSelected.current) {
      justSelected.current = false;
      setQuery("");
      return;
    }
    // Held to the same rule the server applies, so "新建"x"" shows the
    // name that will actually be stored.
    setQuery(normalizeNameInput(next));
  }

  function optionBadge(item: Option) {
    return kind === "series" ? (
      <SeriesBadge>{item.name}</SeriesBadge>
    ) : (
      <TagBadge state={item.reviewState}>{item.name}</TagBadge>
    );
  }

  const accessibleLabel =
    placeholder ?? (kind === "series" ? "选择系列" : "选择标签");

  return (
    <FieldPrimitive.Root className="contents">
      <FieldPrimitive.Label htmlFor={inputId} className="sr-only">
        {accessibleLabel}
      </FieldPrimitive.Label>
      <Combobox
        items={options}
        value={null}
        onValueChange={handleValueChange}
        inputValue={query}
        onInputValueChange={handleInputValueChange}
        open={open}
        onOpenChange={setOpen}
        filter={null}
        itemToStringLabel={(item: Option) => item.name}
        openOnInputClick
      >
        <ComboboxInput
          id={inputId}
          placeholder={placeholder}
          className={className}
          showClear={query.length > 0}
        />
        <ComboboxContent>
          <ComboboxEmpty>无匹配项</ComboboxEmpty>
          <ComboboxList>
            {(item: Option) => (
              <ComboboxItem
                key={item.name}
                value={item}
                disabled={disabled.has(item.name)}
              >
                {/* An alias shows what it resolves to: the typed spelling is
                  struck through and the tag that will be added is emphasised,
                  so picking it holds no surprise. */}
                {item.alias ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <AliasBadge className="shrink-0 line-through">
                      {item.alias}
                    </AliasBadge>
                    {optionBadge(item)}
                  </span>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {item.isNew && <span>新建</span>}
                    {optionBadge(item)}
                  </span>
                )}
                {item.count !== null && (
                  <span className="text-muted-foreground">{item.count}</span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldPrimitive.Root>
  );
}
