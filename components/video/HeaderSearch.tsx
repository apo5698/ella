"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeHref } from "@/lib/homeFilters";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 300;

/**
 * The library search in the header. On the home page the list follows as the
 * user types; elsewhere Enter opens the results. "/" focuses it.
 */
export default function HeaderSearch() {
  const t = useTranslations("Search");
  const home = useTranslations("Home");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onHome = pathname === "/";
  const urlQuery = onHome ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQuery);
  const [seenQuery, setSeenQuery] = useState(urlQuery);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can change underneath, by "Back" or "Clear filters".
  if (urlQuery !== seenQuery) {
    setSeenQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      event.preventDefault();
      setExpanded(true);
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply(query: string, immediate: boolean) {
    clearTimeout(timer.current);
    const run = () => {
      const trimmed = query.trim();
      if (!onHome) {
        if (trimmed) router.push(homeHref(new URLSearchParams({ q: trimmed })));
        return;
      }
      const current = new URLSearchParams(window.location.search);
      const hadQuery = current.has("q");
      current.delete("view");
      if (trimmed) current.set("q", trimmed);
      else current.delete("q");
      // The first keystroke is a step "Back" can undo; the rest refine it.
      const href = homeHref(current);
      if (hadQuery) window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    };
    if (immediate) run();
    else if (onHome) timer.current = setTimeout(run, DEBOUNCE_MS);
  }

  return (
    // Chrome on iOS marks forms and fields for autofill (__gcruniqueid)
    // before React hydrates them. Only these two elements' attributes are
    // exempt from the hydration check.
    <form
      suppressHydrationWarning
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        apply(value, true);
        input.current?.blur();
      }}
      className={cn(
        "flex min-w-0 flex-1 justify-center",
        expanded &&
          "absolute inset-0 z-10 items-center gap-2 bg-background px-2 sm:static sm:px-0",
      )}
    >
      {expanded && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label={t("close")}
          onClick={() => setExpanded(false)}
        >
          <ArrowLeftIcon />
        </Button>
      )}
      <div
        className={cn(
          "group relative w-full max-w-xl",
          !expanded && "hidden sm:block",
        )}
      >
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          suppressHydrationWarning
          ref={input}
          type="search"
          value={value}
          aria-label={t("label")}
          placeholder={home("search")}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            apply(event.target.value, false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              input.current?.blur();
              setExpanded(false);
            }
          }}
          className="h-9 w-full rounded-full border border-input bg-muted/60 pr-16 pl-9 text-sm transition-[background-color,border-color,box-shadow] outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/20 [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {value ? (
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => {
                setValue("");
                apply("", true);
                input.current?.focus();
              }}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground pointer-fine:inline group-focus-within:hidden">
              /
            </kbd>
          )}
        </div>
      </div>
      {!expanded && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto sm:hidden"
          aria-label={t("open")}
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          <SearchIcon />
        </Button>
      )}
    </form>
  );
}
