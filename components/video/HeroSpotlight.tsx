"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, ViewTransition } from "react";
import Link from "next/link";
import { LayersIcon, PlayIcon } from "lucide-react";
import { formatDuration, relativeTime } from "@/lib/format";
import { morphName, setMorphSource, useIsMorphSource } from "@/lib/morph";
import type { VideoCardData } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";
import { canPreview } from "./useVideoPreview";
import VideoResolutionBadge from "./VideoResolutionBadge";

const SLIDE_MS = 8000;
const PREVIEW_DELAY_MS = 1600;
const SWIPE_PX = 40;

function quietPreview() {
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !connection?.saveData
  );
}

function Backdrop({
  video,
  active,
  morphKey,
}: {
  video: VideoCardData;
  active: boolean;
  morphKey: string;
}) {
  const morph = useIsMorphSource(morphKey);
  const [previewing, setPreviewing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || !canPreview(video.ext) || !quietPreview()) return;
    const timer = setTimeout(() => setPreviewing(true), PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setPreviewing(false);
      setReady(false);
    };
  }, [active, video.ext]);

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={video.thumbnail ?? undefined}
      alt=""
      draggable={false}
      fetchPriority={active ? "high" : "low"}
      className={cn(
        "absolute inset-0 size-full object-cover transition-[scale] duration-[9s] ease-linear",
        active ? "motion-safe:scale-100" : "motion-safe:scale-105",
      )}
    />
  );

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 transition-opacity duration-700 ease-out",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {morph ? (
        <ViewTransition name={morphName(video.id)} share="morph" default="none">
          {image}
        </ViewTransition>
      ) : (
        image
      )}
      {previewing && (
        <video
          src={`/api/stream/${video.id}`}
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
          disablePictureInPicture
          aria-hidden
          tabIndex={-1}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            if (Number.isFinite(element.duration))
              element.currentTime = element.duration * 0.2;
          }}
          onPlaying={() => setReady(true)}
          onError={() => setPreviewing(false)}
          className={cn(
            "absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-1000",
            ready && "opacity-100",
          )}
        />
      )}
    </div>
  );
}

/**
 * The large rotating banner at the top of the home page. Each slide shows a
 * still, then a muted clip of the video once it has been on screen a moment.
 */
export default function HeroSpotlight({ videos }: { videos: VideoCardData[] }) {
  const t = useTranslations("Discover");
  const card = useTranslations("VideoCard");
  const locale = useLocale();
  const now = useNow();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = videos.length;

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (count === 0) return null;
  const video = videos[index];
  const morphKey = `hero-${video.id}`;
  const go = (next: number) => setIndex((next + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("featured")}
      className="relative isolate overflow-hidden rounded-2xl bg-black text-white shadow-xl shadow-black/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-[0.98] motion-safe:duration-700 sm:rounded-3xl"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPaused(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setPaused(false);
      }}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setPaused(false);
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchX.current === null) return;
        const delta = event.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(delta) > SWIPE_PX) go(index + (delta < 0 ? 1 : -1));
      }}
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-video lg:aspect-[21/9] lg:max-h-[560px]">
        {videos.map((item, position) => (
          <Backdrop
            key={item.id}
            video={item}
            active={position === index}
            morphKey={`hero-${item.id}`}
          />
        ))}
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-black/0" />
        <div className="absolute inset-0 hidden bg-linear-to-r from-black/70 via-black/20 to-transparent sm:block" />

        <div
          key={video.id}
          className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:max-w-2xl sm:p-8 lg:p-10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700"
          aria-live={paused ? "polite" : "off"}
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">
            {video.series_name ?? t("featured")}
          </p>
          <h2 className="line-clamp-2 text-2xl leading-tight font-semibold break-all text-balance sm:text-3xl lg:text-4xl">
            {video.title}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/75">
            <span className="tabular-nums">
              {formatDuration(video.duration_sec)}
            </span>
            <VideoResolutionBadge width={video.width} height={video.height} />
            <span aria-hidden>·</span>
            <span>{card("views", { count: video.views })}</span>
            <span aria-hidden>·</span>
            <span suppressHydrationWarning>
              {relativeTime(video.mtime, now, locale)}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link
              href={`/video/${video.id}`}
              onClick={() => setMorphSource(morphKey)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <PlayIcon className="size-4 fill-current" />
              {t("play")}
            </Link>
            {video.series_id !== null && (
              <Link
                href={`/?series=${video.series_id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
              >
                <LayersIcon className="size-4" />
                {t("moreInSeries")}
              </Link>
            )}
          </div>
        </div>

        {count > 1 && (
          <div className="absolute top-4 right-4 flex gap-1.5 sm:top-auto sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8">
            {videos.map((item, position) => (
              <button
                key={item.id}
                type="button"
                aria-label={t("slide", { index: position + 1, count })}
                aria-current={position === index}
                onClick={() => go(position)}
                className="relative h-1.5 w-6 sm:w-8 overflow-hidden rounded-full bg-white/30 transition-[width] duration-300 hover:bg-white/50 aria-current:w-10 sm:aria-current:w-12"
              >
                {position === index && (
                  <span
                    key={`${item.id}-${index}`}
                    className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-white motion-safe:animate-[hero-progress_linear_forwards]"
                    // The bar is the timer: the slide advances when it fills,
                    // so pausing it pauses the carousel. Without motion it
                    // does not run, and the slides stay put.
                    onAnimationEnd={() => go(index + 1)}
                    style={{
                      animationDuration: `${SLIDE_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
