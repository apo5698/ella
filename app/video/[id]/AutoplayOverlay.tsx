"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PlayIcon } from "lucide-react";
import type { VideoCardData } from "@/lib/types";

const COUNTDOWN_SECONDS = 8;
const RING = 2 * Math.PI * 22;

/**
 * Shown when a video ends with autoplay on: the next video, and a ring that
 * runs down before it starts. Either button acts at once.
 */
export default function AutoplayOverlay({
  next,
  onPlay,
  onCancel,
}: {
  next: VideoCardData;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Watch");
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (left <= 0) {
      onPlay();
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, onPlay]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 text-white backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300">
        <p className="text-sm text-white/70">{t("playingNext")}</p>
        <div className="flex w-full items-center gap-3 text-left">
          {next.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={next.thumbnail}
              alt=""
              className="aspect-video w-32 shrink-0 rounded-lg object-cover sm:w-40"
            />
          )}
          <p className="line-clamp-3 min-w-0 text-sm font-medium break-all sm:text-base">
            {next.title}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            aria-label={t("playNow")}
            className="relative flex size-14 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="22"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2.5"
              />
              <circle
                cx="24"
                cy="24"
                r="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (left / COUNTDOWN_SECONDS)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <PlayIcon className="size-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-full bg-white/10 px-4 text-sm font-medium transition-colors hover:bg-white/20"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
