"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Monitor,
  TvMinimalPlay,
  VideoOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { videoIcons } from "./videoIcons";
import styles from "./VideoPlayer.module.css";

const SEEK_STEP_SECONDS = 10;
const SEEK_FEEDBACK_MS = 900;
const SEEK_FEEDBACK_EXIT_MS = 150;

type SeekFeedback = {
  direction: -1 | 1;
  seconds: number;
  sequence: number;
};

/**
 * Counts a view when playback actually starts, not when the page loads.
 * Fires at most once per mount, so pausing and resuming is still one view.
 *
 * Owns the metadata row too, so the displayed count can update in place the
 * moment playback begins.
 */
export default function VideoPlayer({
  videoId,
  src,
  poster,
  initialViews,
  meta,
}: {
  videoId: number;
  src: string;
  poster?: string;
  initialViews: number;
  meta: { duration: string; resolution: string | null; size: string };
}) {
  const counted = useRef(false);
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

  useEffect(
    () => () => {
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    },
    [],
  );

  function handleDoubleClick(event: React.MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width;
    const direction: -1 | 1 | null =
      position <= 0.2 ? -1 : position >= 0.8 ? 1 : null;
    if (direction === null) return;

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
  }

  async function handlePlay() {
    if (counted.current) return;
    counted.current = true;
    try {
      const res = await fetch(`/api/videos/${videoId}/view`, {
        method: "POST",
      });
      const data = await res.json();
      if (typeof data.views === "number") setViews(data.views);
    } catch {
      // A failed count must not interrupt playback.
    }
  }

  return (
    <>
      {unavailable ? (
        <Alert variant="destructive">
          <VideoOff />
          <AlertTitle>无法读取文件</AlertTitle>
          <AlertDescription>
            请确认存储设备已连接，且文件仍位于下方路径。
          </AlertDescription>
        </Alert>
      ) : (
        <MediaPlayer
          src={src}
          poster={poster}
          playsInline
          className={cn(
            styles.player,
            "max-h-dvh w-full overflow-hidden rounded-lg font-sans ring-1 ring-foreground/10",
          )}
          onPlay={handlePlay}
          onError={() => setFailedSrc(src)}
          onDoubleClick={handleDoubleClick}
        >
          <MediaProvider />
          <DefaultVideoLayout icons={videoIcons} />
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
                  <ChevronsLeft className="size-5" />
                ) : (
                  <ChevronsRight className="size-5" />
                )}
                <span className="tabular-nums">
                  {seekFeedback.direction < 0 ? "−" : "+"}
                  {seekFeedback.seconds}
                </span>
              </div>
            </div>
          )}
        </MediaPlayer>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <TvMinimalPlay className="size-3" /> {views}
        </span>
        {meta.resolution && (
          <span className="flex items-center gap-1">
            <Monitor className="size-3" /> {meta.resolution}
          </span>
        )}
        <span className="flex items-center gap-1">
          <FileText className="size-3" /> {meta.size}
        </span>
      </div>
    </>
  );
}
