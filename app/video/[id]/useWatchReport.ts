"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WatchReport } from "@/lib/watchEvents";
import { HEAT_BUCKETS, heatBucket, viewThreshold } from "@/lib/watchRules";

/** A gap between two time updates longer than this was a seek, not viewing. */
const MAX_STEP_SECONDS = 2;

type Sitting = {
  session: string;
  source: WatchReport["source"];
  watched: number;
  position: number;
  duration: number | null;
  /** Seconds played in each heat bucket, replays included. */
  heat: number[];
  /** Set once the report that makes this sitting a view has gone out. */
  viewSent: boolean;
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

const tenths = (seconds: number) => Math.round(seconds * 10) / 10;

/**
 * Measures how much of a video this sitting actually played, and which parts,
 * skipped parts excluded. The totals feed recommendations
 * (docs/recommendations.md), the view count and the watch heat curve
 * (lib/heat.ts).
 *
 * Reports go out on pause, at the end, when the page is hidden and when the
 * player leaves, so leaving the tab without pausing still counts. One more
 * goes out the moment the sitting plays long enough to be a view, and its
 * answer carries the new count to `onView`.
 */
export function useWatchReport(
  videoId: number,
  enabled: boolean,
  onView?: (views: number) => void,
) {
  const sitting = useRef<Sitting | null>(null);
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  });

  const send = useCallback(
    (current: Sitting, beacon: boolean) => {
      current.sent = current.watched;
      const report: WatchReport = {
        session: current.session,
        source: current.source,
        watched: tenths(current.watched),
        position: tenths(current.position),
        duration: current.duration,
        heat: current.duration ? current.heat.map(tenths) : undefined,
      };
      const url = `/api/videos/${videoId}/watch`;
      const body = new Blob([JSON.stringify(report)], {
        type: "application/json",
      });
      if (beacon && navigator.sendBeacon?.(url, body)) return;
      void fetch(url, { method: "POST", body, keepalive: true })
        .then((res) => (res.status === 200 ? res.json() : null))
        .then((data: { views?: unknown } | null) => {
          if (typeof data?.views === "number") onViewRef.current?.(data.views);
        })
        .catch(() => {});
    },
    [videoId],
  );

  const flush = useCallback(() => {
    const current = sitting.current;
    if (!current || current.sent === current.watched) return;
    send(current, true);
  }, [send]);

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
        heat: new Array<number>(HEAT_BUCKETS).fill(0),
        viewSent: false,
        last: null,
        sent: -1,
      };
    },
    [enabled],
  );

  const progress = useCallback(
    (time: number, duration: number) => {
      const current = sitting.current;
      if (!current) return;
      if (Number.isFinite(duration) && duration > 0)
        current.duration = duration;
      const step = current.last === null ? 0 : time - current.last;
      if (step > 0 && step <= MAX_STEP_SECONDS) {
        current.watched += step;
        if (current.duration)
          current.heat[heatBucket(current.last!, current.duration)] += step;
      }
      current.last = time;
      current.position = Math.max(current.position, time);
      if (
        !current.viewSent &&
        current.watched >= viewThreshold(current.duration)
      ) {
        current.viewSent = true;
        send(current, false);
      }
    },
    [send],
  );

  return { start, progress, flush };
}
