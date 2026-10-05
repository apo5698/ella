"use client";

import { useSyncExternalStore } from "react";

/** How a narrow screen lays out the video grid. */
export type GridLayout = "double" | "single";

const KEY = "ella:grid-layout";
const listeners = new Set<() => void>();

function read(): GridLayout {
  try {
    return localStorage.getItem(KEY) === "single" ? "single" : "double";
  } catch {
    return "double";
  }
}

export function setGridLayout(layout: GridLayout) {
  try {
    localStorage.setItem(KEY, layout);
  } catch {
    // Without storage the grid keeps its default.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Two columns by default, as on Bilibili; the viewer may choose one. */
export function useGridLayout() {
  return useSyncExternalStore(subscribe, read, () => "double" as const);
}
