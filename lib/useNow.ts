"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(listener: () => void) {
  const timer = setInterval(listener, MINUTE);
  return () => clearInterval(timer);
}

/** The time to the minute, for "5 minutes ago". Hydrates without mismatch. */
const now = () => Math.floor(Date.now() / MINUTE) * MINUTE;

export function useNow() {
  return useSyncExternalStore(subscribe, now, now);
}
