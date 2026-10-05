"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Formats the browser can decode. The rest show their thumbnail only. */
const PLAYABLE = new Set([".mp4", ".m4v", ".webm", ".mov"]);
const HOVER_DELAY_MS = 450;
/** How long a card must hold the middle of a feed before it plays. */
const FEED_DELAY_MS = 600;
/** Points across the video the preview visits, as fractions of its length. */
const SEGMENTS = [0.12, 0.3, 0.48, 0.66, 0.84];
const SEGMENT_SECONDS = 2.5;
/** Shorter videos play straight through instead of in segments. */
const MONTAGE_MIN_SECONDS = 45;
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
 * one-column feed, when the card holds the middle of the screen. It plays
 * short segments from across the video; moving the mouse sideways scrubs to
 * that point instead. Touch alone never starts it.
 */
export function useVideoPreview({
  id,
  ext,
  duration,
  autoplay = false,
}: {
  id: number;
  ext: string;
  duration: number | null;
  /** Play without a mouse, as the card in focus in a feed. */
  autoplay?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startX = useRef<number | null>(null);
  const segment = useRef(0);
  const scrubbed = useRef(false);
  const enabled = canPreview(ext) && !failed;
  const montage = (duration ?? 0) >= MONTAGE_MIN_SECONDS;
  const owner = useRef({});

  const stop = useCallback(() => {
    clearTimeout(hoverTimer.current);
    clearTimeout(idleTimer.current);
    if (playing?.owner === owner.current) playing = null;
    setActive(false);
    setReady(false);
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
    if (!active || !video || !Number.isFinite(video.duration)) {
      // Measured from where the mouse rests when the preview starts.
      startX.current = event.clientX;
      return;
    }
    if (!scrubbed.current) {
      if (Math.abs(event.clientX - startX.current) < SCRUB_THRESHOLD_PX) return;
      scrubbed.current = true;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width),
    );
    setScrubbing(true);
    setPosition(fraction);
    video.pause();
    video.currentTime = fraction * video.duration;
    clearTimeout(idleTimer.current);
    // Once the mouse rests, play on from the chosen point.
    idleTimer.current = setTimeout(() => {
      setScrubbing(false);
      void video.play().catch(() => {});
    }, SCRUB_IDLE_MS);
  };

  const videoProps = {
    ref: videoRef,
    src: active ? `/api/stream/${id}` : undefined,
    muted: true,
    playsInline: true,
    preload: "auto" as const,
    disablePictureInPicture: true,
    "aria-hidden": true,
    tabIndex: -1,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (montage && Number.isFinite(video.duration))
        video.currentTime = SEGMENTS[0] * video.duration;
      void video.play().catch(() => {});
    },
    onPlaying: () => setReady(true),
    onSeeked: () => {
      if (scrubbed.current) setReady(true);
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (!Number.isFinite(video.duration)) return;
      if (!scrubbing) setPosition(video.currentTime / video.duration);
      if (!montage || scrubbed.current) return;
      const start = SEGMENTS[segment.current] * video.duration;
      if (video.currentTime - start < SEGMENT_SECONDS) return;
      segment.current = (segment.current + 1) % SEGMENTS.length;
      video.currentTime = SEGMENTS[segment.current] * video.duration;
    },
    onEnded: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      event.currentTarget.currentTime = 0;
      void event.currentTarget.play().catch(() => {});
    },
    onError: () => {
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
