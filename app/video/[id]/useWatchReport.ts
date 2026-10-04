"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WatchReport } from "@/lib/watchEvents";

/** A gap between two time updates longer than this was a seek, not viewing. */
const MAX_STEP_SECONDS = 2;

type Sitting = {
  session: string;
  source: WatchReport["source"];
  watched: number;
  position: number;
  duration: number | null;
  /** The playhead at the previous time update. */
  last: number | null;
  /** The watched total in the last report, so an unchanged one is skipped. */
  sent: number;
};

function newSession() {
  // crypto.randomUUID exists only on HTTPS, and Ella is often opened by its
  // LAN address over plain HTTP.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Measures how much of a video this sitting actually played, skipped parts
 * excluded, and reports it for recommendations (docs/recommendations.md).
 * Reports go out on pause, at the end, when the page is hidden and when the
 * player leaves, so leaving the tab without pausing still counts.
 */
export function useWatchReport(videoId: number, enabled: boolean) {
  const sitting = useRef<Sitting | null>(null);

  const flush = useCallback(() => {
    const current = sitting.current;
    if (!current || current.sent === current.watched) return;
    current.sent = current.watched;
    const report: WatchReport = {
      session: current.session,
      source: current.source,
      watched: Math.round(current.watched * 10) / 10,
      position: Math.round(current.position * 10) / 10,
      duration: current.duration,
    };
    const url = `/api/videos/${videoId}/watch`;
    const body = new Blob([JSON.stringify(report)], {
      type: "application/json",
    });
    if (!navigator.sendBeacon?.(url, body))
      void fetch(url, { method: "POST", body, keepalive: true }).catch(
        () => {},
      );
  }, [videoId]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [enabled, flush]);

  /** Playback started. The first start opens the sitting. */
  const start = useCallback(
    (source: WatchReport["source"]) => {
      if (!enabled || sitting.current) return;
      sitting.current = {
        session: newSession(),
        source,
        watched: 0,
        position: 0,
        duration: null,
        last: null,
        sent: -1,
      };
    },
    [enabled],
  );

  const progress = useCallback((time: number, duration: number) => {
    const current = sitting.current;
    if (!current) return;
    const step = current.last === null ? 0 : time - current.last;
    if (step > 0 && step <= MAX_STEP_SECONDS) current.watched += step;
    current.last = time;
    current.position = Math.max(current.position, time);
    if (Number.isFinite(duration) && duration > 0) current.duration = duration;
  }, []);

  return { start, progress, flush };
}
