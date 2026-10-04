"use client";

import { useSyncExternalStore } from "react";

const KEY = "ella:autoplay";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoplay(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Without storage the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the next video starts by itself. On by default. */
export function useAutoplay() {
  return useSyncExternalStore(subscribe, read, () => true);
}

const HANDOFF = "ella:autoplay-next";

/** Asks the next page's player to start by itself. */
export function handOffPlayback(id: number) {
  try {
    sessionStorage.setItem(HANDOFF, String(id));
  } catch {
    // The next video then waits for the play button.
  }
}

/** True once, on the page autoplay opened. */
export function takePlaybackHandOff(id: number) {
  try {
    if (sessionStorage.getItem(HANDOFF) !== String(id)) return false;
    sessionStorage.removeItem(HANDOFF);
    return true;
  } catch {
    return false;
  }
}
