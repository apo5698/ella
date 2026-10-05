"use client";

import { useTranslations } from "next-intl";

import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  ViewTransition,
} from "react";
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
} from "@vidstack/react";
import { DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FileTextIcon,
  MonitorIcon,
  TvMinimalPlayIcon,
  VideoOffIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDuration } from "@/lib/format";
import type { Heat } from "@/lib/heat";
import type { WatchReport } from "@/lib/watchEvents";
import { morphName } from "@/lib/morph";
import { cn } from "@/lib/utils";
import {
  clearProgress,
  isResumable,
  readProgress,
  saveProgress,
} from "@/lib/watchProgress";
import HeatCurve from "./HeatCurve";
import { takePlaybackHandOff } from "./useAutoplay";
import { useWatchReport } from "./useWatchReport";
import { videoIcons } from "./videoIcons";
import styles from "./VideoPlayer.module.css";

const SEEK_STEP_SECONDS = 10;
const SEEK_FEEDBACK_MS = 900;
const SEEK_FEEDBACK_EXIT_MS = 150;
const SAVE_INTERVAL_MS = 5000;
const RESUME_NOTICE_MS = 6000;

type SeekFeedback = {
  direction: -1 | 1;
  seconds: number;
  sequence: number;
};

function MorphFrame({
  enabled,
  id,
  children,
}: {
  enabled: boolean;
  id: number;
  children: React.ReactNode;
}) {
  if (!enabled) return children;
  return (
    <ViewTransition name={morphName(id)} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Plays a video and reports what was watched, see useWatchReport. The server
 * counts a view once the sitting has played long enough, and the answer to
 * that report updates the count in the metadata row in place.
 */
export default function VideoPlayer({
  videoId,
  src,
  poster,
  initialViews,
  meta,
  heat,
  countViews = true,
  trackProgress = countViews,
  showMeta = true,
  morph = false,
  playerRef,
  onEnded,
  onViewsChange,
  children,
}: {
  videoId: number;
  src: string;
  poster?: string;
  initialViews: number;
  meta: { duration: string; resolution: string | null; size: string };
  /** Drawn above the time slider, see lib/heat.ts. */
  heat?: Heat;
  /** Off where playback is part of editing rather than watching. */
  countViews?: boolean;
  /** Resume where this browser stopped, and remember where it stops. */
  trackProgress?: boolean;
  /** Off where the page shows the facts itself. */
  showMeta?: boolean;
  /** Receive the thumbnail that was opened, see lib/morph.ts. */
  morph?: boolean;
  playerRef?: React.Ref<MediaPlayerInstance>;
  onEnded?: () => void;
  onViewsChange?: (views: number) => void;
  /** Drawn over the video, and kept in view in full screen. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("Player");
  const [views, setViews] = useState(initialViews);
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback | null>(null);
  const [seekFeedbackExiting, setSeekFeedbackExiting] = useState(false);
  const lastSeek = useRef<SeekFeedback & { at: number }>({
    direction: 1,
    seconds: 0,
    sequence: 0,
    at: 0,
  });
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Left to itself the element shows a poster above a dead control and states
  // no reason. The stream route answers 404 both when the file is gone and
  // when the library volume is not attached.
  //
  // Recorded as the source that failed rather than a plain flag. While the
  // alert is up the player is unmounted, so nothing would ever clear a flag;
  // pointing the player at a different video clears this one by itself.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const unavailable = failedSrc === src;
  const player = useRef<MediaPlayerInstance | null>(null);
  const savedAt = useRef(0);
  const resumeChecked = useRef(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const handedOff = useRef(false);
  const startedBy = useRef<WatchReport["source"]>("click");
  const report = useWatchReport(videoId, countViews, (count) => {
    setViews(count);
    onViewsChange?.(count);
  });

  // Without dependencies, so it follows the player when it remounts.
  useImperativeHandle(playerRef, () => player.current as MediaPlayerInstance);

  useEffect(() => {
    if (resumedFrom === null) return;
    const timer = setTimeout(() => setResumedFrom(null), RESUME_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [resumedFrom]);

  function handleCanPlay() {
    // Autoplay opened this page: start, if the browser allows it.
    if (!handedOff.current) {
      handedOff.current = true;
      const instance = player.current;
      if (instance && takePlaybackHandOff(videoId)) {
        startedBy.current = "autoplay";
        // A browser that refuses sound without a click still plays muted.
        void instance.play().catch(() => {
          instance.muted = true;
          return instance.play().catch(() => {});
        });
      }
    }
    if (!trackProgress || resumeChecked.current) return;
    resumeChecked.current = true;
    const entry = readProgress()[videoId];
    if (!isResumable(entry) || !player.current) return;
    player.current.currentTime = entry.time;
    setResumedFrom(entry.time);
    if (startedBy.current === "click") startedBy.current = "resume";
  }

  function handleTimeUpdate(currentTime: number) {
    report.progress(currentTime, player.current?.state.duration ?? 0);
    if (!trackProgress || !resumeChecked.current) return;
    const now = Date.now();
    if (now - savedAt.current < SAVE_INTERVAL_MS) return;
    savedAt.current = now;
    saveProgress(videoId, currentTime, player.current?.state.duration ?? 0);
  }

  function handlePause() {
    report.flush();
    if (!trackProgress || !player.current) return;
    saveProgress(
      videoId,
      player.current.currentTime,
      player.current.state.duration,
    );
  }

  useEffect(
    () => () => {
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    },
    [],
  );

  // Answers the layout's own double tap gestures rather than dblclick, which
  // a touch screen never fires: the gesture cancels the touch to claim it.
  const showSeekFeedback = useEffectEvent((action: unknown) => {
    if (action !== "seek:-10" && action !== "seek:10") return;
    const direction = action === "seek:-10" ? -1 : 1;

    const now = performance.now();
    const previous = lastSeek.current;
    const seconds =
      previous.direction === direction && now - previous.at <= SEEK_FEEDBACK_MS
        ? previous.seconds + SEEK_STEP_SECONDS
        : SEEK_STEP_SECONDS;
    const next: SeekFeedback & { at: number } = {
      direction,
      seconds,
      sequence: previous.sequence + 1,
      at: now,
    };
    lastSeek.current = next;
    setSeekFeedback(next);
    setSeekFeedbackExiting(false);

    if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    seekFeedbackTimer.current = setTimeout(() => {
      setSeekFeedbackExiting(true);
      seekFeedbackTimer.current = setTimeout(() => {
        setSeekFeedback(null);
        setSeekFeedbackExiting(false);
      }, SEEK_FEEDBACK_EXIT_MS);
    }, SEEK_FEEDBACK_MS);
  });

  useEffect(() => {
    // Gestures dispatch "trigger" without bubbling, so listen while it
    // descends. On the document, because the player attaches its element
    // only after this effect runs.
    const onTrigger = (event: Event) => {
      const element = player.current?.el;
      if (element && event.composedPath().includes(element))
        showSeekFeedback((event as Event & { detail?: unknown }).detail);
    };
    document.addEventListener("trigger", onTrigger, { capture: true });
    return () =>
      document.removeEventListener("trigger", onTrigger, { capture: true });
  }, []);

  function handlePlay() {
    report.start(startedBy.current);
  }

  return (
    <>
      {unavailable ? (
        <Alert variant="destructive">
          <VideoOffIcon />
          <AlertTitle>{t("unavailable")}</AlertTitle>
          <AlertDescription>{t("unavailableHelp")}</AlertDescription>
        </Alert>
      ) : (
        <MorphFrame enabled={morph} id={videoId}>
          <MediaPlayer
            ref={player}
            aria-label={t("label")}
            src={src}
            poster={poster}
            playsInline
            className={cn(
              styles.player,
              "max-h-dvh w-full overflow-hidden rounded-lg font-sans ring-1 ring-foreground/10",
            )}
            onPlay={handlePlay}
            onCanPlay={handleCanPlay}
            onTimeUpdate={(detail) => handleTimeUpdate(detail.currentTime)}
            onPause={handlePause}
            onEnded={() => {
              report.flush();
              if (trackProgress) clearProgress(videoId);
              onEnded?.();
            }}
            onError={() => setFailedSrc(src)}
          >
            <MediaProvider />
            <DefaultVideoLayout
              icons={videoIcons}
              translations={t.raw("controls")}
              slots={
                heat && (heat.watch || heat.scene)
                  ? { beforeTimeSlider: <HeatCurve heat={heat} /> }
                  : undefined
              }
            />
            {seekFeedback && (
              <div
                key={seekFeedback.sequence}
                role="status"
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute inset-y-0 z-10 flex w-1/5 items-center justify-center",
                  seekFeedback.direction < 0 ? "left-0" : "right-0",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-full bg-background/70 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm animation-duration-150",
                    seekFeedbackExiting
                      ? "animate-out fade-out zoom-out-95 ease-in"
                      : "animate-in fade-in zoom-in-95 ease-out",
                  )}
                >
                  {seekFeedback.direction < 0 ? (
                    <ChevronsLeftIcon className="size-5" />
                  ) : (
                    <ChevronsRightIcon className="size-5" />
                  )}
                  <span className="tabular-nums">
                    {seekFeedback.direction < 0 ? "−" : "+"}
                    {seekFeedback.seconds}
                  </span>
                </div>
              </div>
            )}
            {resumedFrom !== null && (
              <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/70 py-1 pr-1 pl-3 text-xs text-white backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1">
                {t("resumed", { time: formatDuration(resumedFrom) })}
                <button
                  type="button"
                  className="pointer-events-auto rounded-full bg-white/15 px-2 py-0.5 font-medium hover:bg-white/25"
                  onClick={() => {
                    if (player.current) player.current.currentTime = 0;
                    setResumedFrom(null);
                  }}
                >
                  {t("restart")}
                </button>
              </div>
            )}
            {children}
          </MediaPlayer>
        </MorphFrame>
      )}
      {showMeta && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <TvMinimalPlayIcon className="size-3" /> {views}
          </span>
          {meta.resolution && (
            <span className="flex items-center gap-1">
              <MonitorIcon className="size-3" /> {meta.resolution}
            </span>
          )}
          <span className="flex items-center gap-1">
            <FileTextIcon className="size-3" /> {meta.size}
          </span>
        </div>
      )}
    </>
  );
}
