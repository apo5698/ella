"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/**
 * Which thumbnail the viewer opened, so only that one morphs into the player.
 * A video can appear several times on one page (a spotlight and two shelves),
 * and the browser abandons a view transition when two elements share a name.
 */
let source: string | null = null;
const listeners = new Set<() => void>();

/** Marks `key` as the thumbnail to morph. Call from the click handler. */
export function setMorphSource(key: string) {
  if (source === key) return;
  // Synchronous, so the name is on the element before the navigation's
  // transition takes its snapshot of the old page.
  flushSync(() => {
    source = key;
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsMorphSource(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => source === key,
    () => false,
  );
}

export const morphName = (id: number) => `video-${id}`;
