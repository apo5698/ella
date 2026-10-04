"use client";

/**
 * Lists mark the history entry they leave from, so returning to that entry
 * with "Back" restores them, while reaching the same list by a link starts it
 * fresh. The mark lives in the entry's own state, beside the router's.
 */
const FIELD = "ellaList";

export function markHistoryEntry(key: string) {
  window.history.replaceState({ ...window.history.state, [FIELD]: key }, "");
}

export function isMarkedHistoryEntry(key: string) {
  return (
    (window.history.state as Record<string, unknown> | null)?.[FIELD] === key
  );
}
