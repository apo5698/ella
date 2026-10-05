"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clipPosition,
  MONTAGE_MIN_SECONDS,
  previewPointsOf,
  previewSegments,
  SEGMENT_SECONDS,
} from "@/lib/previewSegments";

/** Formats the browser can decode. The rest show their thumbnail only. */
const PLAYABLE = new Set([".mp4", ".m4v", ".webm", ".mov"]);
const HOVER_DELAY_MS = 450;
/** How long a card must hold the middle of a feed before it plays. */
const FEED_DELAY_MS = 600;
const SCRUB_THRESHOLD_PX = 6;
const SCRUB_IDLE_MS = 700;

/** The preview playing now, so starting another can stop it. */
let playing: { owner: object; stop: () => void } | null = null;

export function canPreview(ext: string) {
  return PLAYABLE.has(ext.toLowerCase());
}

function previewAllowed() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return false;
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  return !connection?.saveData;
}

/**
 * A muted preview that starts when the mouse rests on a thumbnail, or, in a
 * one-column feed, when the card holds the middle of the screen. It plays the
 * clip lib/previewClips.ts cut from the hottest parts of the video; until that
 * exists, it plays the same segments from the full file. Moving the mouse
 * sideways scrubs to that point instead, which needs the full file, so only
 * then is it loaded. Touch alone never starts it.
 */
export function useVideoPreview({
  id,
  ext,
  duration,
  points = null,
  clip = null,
  autoplay = false,
}: {
  id: number;
  ext: string;
  duration: number | null;
  /** videos.preview_points. */
  points?: string | null;
  /** When the preview clip was cut, or null while it has none. */
  clip?: number | null;
  /** Play without a mouse, as the card in focus in a feed. */
  autoplay?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  /** Playing the full file rather than the clip, to scrub through it. */
  const [full, setFull] = useState(false);
  const [position, setPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startX = useRef<number | null>(null);
  const segment = useRef(0);
  const scrubbed = useRef(false);
  /** Where the scrub points while the full file is still loading. */
  const scrubTarget = useRef(0);
  const owner = useRef({});
  const playable = canPreview(ext);
  const hasClip = clip !== null && !clipFailed;
  const enabled = (hasClip || playable) && !failed;
  const fromClip = hasClip && !full;
  const montage = (duration ?? 0) >= MONTAGE_MIN_SECONDS;
  const segments = previewPointsOf(points);

  const stop = useCallback(() => {
    clearTimeout(hoverTimer.current);
    clearTimeout(idleTimer.current);
    if (playing?.owner === owner.current) playing = null;
    setActive(false);
    setReady(false);
    setFull(false);
    setScrubbing(false);
    setPosition(0);
    startX.current = null;
    segment.current = 0;
    scrubbed.current = false;
  }, []);

  useEffect(() => stop, [stop]);

  /** Takes over from any other preview on the page. */
  const begin = useCallback(() => {
    if (playing?.owner !== owner.current) playing?.stop();
    playing = { owner: owner.current, stop };
    setActive(true);
  }, [stop]);

  // A card scrolled through quickly never starts; the one that settles does.
  useEffect(() => {
    if (!autoplay || !enabled || !previewAllowed()) return;
    const timer = setTimeout(begin, FEED_DELAY_MS);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [autoplay, begin, enabled, stop]);

  const onPointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "mouse" || !previewAllowed()) return;
    startX.current = event.clientX;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(begin, HOVER_DELAY_MS);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || startX.current === null) return;
    const video = videoRef.current;
    if (!scrubbed.current) {
      if (!active || !video || !Number.isFinite(video.duration)) {
        // Measured from where the mouse rests when the preview starts.
        startX.current = event.clientX;
        return;
      }
      if (Math.abs(event.clientX - startX.current) < SCRUB_THRESHOLD_PX) return;
      // The full file is what a scrub moves through, and a format the browser
      // cannot decode has only the clip.
      if (!playable) return;
      scrubbed.current = true;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width),
    );
    setScrubbing(true);
    setPosition(fraction);
    scrubTarget.current = fraction;
    clearTimeout(idleTimer.current);
    // Once the mouse rests, play on from the chosen point.
    idleTimer.current = setTimeout(() => {
      setScrubbing(false);
      void videoRef.current?.play().catch(() => {});
    }, SCRUB_IDLE_MS);
    if (fromClip) {
      // Switching the source loads the full file; its metadata handler seeks.
      // The thumbnail shows again until that frame is there.
      setReady(false);
      setFull(true);
      return;
    }
    if (!video || !Number.isFinite(video.duration)) return;
    video.pause();
    video.currentTime = fraction * video.duration;
  };

  const videoProps = {
    ref: videoRef,
    src: active
      ? fromClip
        ? `/api/preview/${id}?v=${clip}`
        : `/api/stream/${id}`
      : undefined,
    muted: true,
    playsInline: true,
    preload: "auto" as const,
    disablePictureInPicture: true,
    "aria-hidden": true,
    tabIndex: -1,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (fromClip) {
        void video.play().catch(() => {});
        return;
      }
      if (!Number.isFinite(video.duration)) return;
      if (scrubbed.current) {
        video.currentTime = scrubTarget.current * video.duration;
        return;
      }
      if (montage) video.currentTime = segments[0] * video.duration;
      void video.play().catch(() => {});
    },
    onPlaying: () => setReady(true),
    onSeeked: () => {
      if (scrubbed.current) setReady(true);
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (!Number.isFinite(video.duration)) return;
      if (fromClip) {
        // The clip is the montage already, so it only needs its place shown.
        setPosition(
          duration
            ? clipPosition(
                previewSegments(duration, points),
                video.currentTime,
                duration,
              )
            : video.currentTime / video.duration,
        );
        return;
      }
      if (!scrubbing) setPosition(video.currentTime / video.duration);
      if (!montage || scrubbed.current) return;
      const start = segments[segment.current] * video.duration;
      if (video.currentTime - start < SEGMENT_SECONDS) return;
      segment.current = (segment.current + 1) % segments.length;
      video.currentTime = segments[segment.current] * video.duration;
    },
    onEnded: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      event.currentTarget.currentTime = 0;
      void event.currentTarget.play().catch(() => {});
    },
    onError: () => {
      // A clip that cannot load leaves the full file to play, when the
      // browser can decode it.
      if (fromClip) {
        setClipFailed(true);
        if (!playable) stop();
        return;
      }
      // An unsupported codec inside a supported container lands here. Keep
      // the thumbnail and do not try this video again.
      setFailed(true);
      stop();
    },
  };

  return {
    active,
    ready: active && ready,
    position,
    scrubbing,
    handlers: { onPointerEnter, onPointerMove, onPointerLeave: stop },
    videoProps,
  };
}
