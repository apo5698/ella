"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the viewer stopped in each video. Kept in this browser only: it is a
 * convenience of one device, like a bookmark, not library data.
 */
const KEY = "ella:watch-progress";
const LIMIT = 200;
/** Closer to either end than this, a video counts as not started or done. */
const EDGE = 0.03;
const TAIL_SECONDS = 20;

export type WatchEntry = { time: number; duration: number; at: number };
type WatchMap = Record<string, WatchEntry>;

const listeners = new Set<() => void>();
let cache: WatchMap | null = null;

/** Every saved position, read once outside React. */
export function readProgress(): WatchMap {
  return read();
}

function read(): WatchMap {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as WatchMap;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: WatchMap) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked. Progress is a convenience only.
  }
  listeners.forEach((listener) => listener());
}

/** True when the position is worth resuming from. */
export function isResumable(entry: WatchEntry | undefined) {
  if (!entry || !entry.duration) return false;
  const fraction = entry.time / entry.duration;
  return (
    fraction > EDGE &&
    fraction < 1 - EDGE &&
    entry.duration - entry.time > TAIL_SECONDS
  );
}

export function saveProgress(id: number, time: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const map = { ...read() };
  const entry = { time, duration, at: Date.now() };
  if (isResumable(entry)) map[id] = entry;
  else delete map[id];
  // The oldest entries go first once the list is full.
  const ids = Object.keys(map);
  if (ids.length > LIMIT)
    ids
      .sort((a, b) => map[a].at - map[b].at)
      .slice(0, ids.length - LIMIT)
      .forEach((key) => delete map[key]);
  write(map);
}

export function clearProgress(id: number) {
  const map = { ...read() };
  if (!(id in map)) return;
  delete map[id];
  write(map);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: WatchMap = {};

/** Every saved position, newest first is up to the caller. */
export function useWatchProgress(): WatchMap {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
