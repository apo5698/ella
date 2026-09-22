"use client";

import { useLocale, useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { ScanSearchIcon, TimerIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isAppLocale } from "@/i18n/config";
import HelpTip from "@/components/HelpTip";
import { formatDurationText } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DECODE_RATE_RANGE } from "@/lib/progress";
import {
  FRAME_COUNT_RANGE,
  FRAME_WIDTHS,
  type FrameStrategy,
  type TagSettings,
} from "@/lib/settings";
import type { SettingsResponse } from "@/app/api/settings/route";

/** Estimated seek and frame extraction cost in seconds. */
const SEEK_SEC = 0.117;

const [FRAME_COUNT_MIN, FRAME_COUNT_MAX] = FRAME_COUNT_RANGE;
/** Where the slider starts when the user first turns automatic off. */
const DEFAULT_MANUAL_FRAMES = 6;

const STRATEGIES: {
  value: FrameStrategy;
  label: string;
  icon: typeof ScanSearchIcon;
  blurb: string;
}[] = [
  {
    value: "scene",
    label: "scene",
    icon: ScanSearchIcon,
    blurb: "sceneHelp",
  },
  {
    value: "fixed",
    label: "fixed",
    icon: TimerIcon,
    blurb: "fixedHelp",
  },
];

/** Estimate extraction time without model inference. */
function extractionCost(
  strategy: FrameStrategy,
  settings: TagSettings,
  pending: SettingsResponse["pending"],
): { min: number; max: number } {
  const frames =
    settings.frameCount !== null
      ? settings.frameCount * pending.count
      : pending.autoFrames;
  const grabbing = frames * SEEK_SEC;
  // Seeking touches only a few keyframes, so it has no decode pass to vary.
  if (strategy === "fixed") return { min: grabbing, max: grabbing };
  const [slowest, fastest] = DECODE_RATE_RANGE;
  return {
    min: pending.seconds / fastest + grabbing,
    max: pending.seconds / slowest + grabbing,
  };
}

/** Round estimates above one minute to avoid false precision. */
function coarsen(sec: number): number {
  return sec < 60 ? sec : Math.round(sec / 60) * 60;
}

export default function FrameSettingsCard() {
  const t = useTranslations("Frames");
  const locale = useLocale();
  const languageItems = [
    { value: "auto", label: t("languageAutomatic") },
    { value: "en", label: t("languageEnglish") },
    { value: "zh-CN", label: t("languageChinese") },
  ];
  function formatRange(cost: { min: number; max: number }): string {
    const min = coarsen(cost.min);
    const max = coarsen(cost.max);
    return max - min < min * 0.1
      ? t("approximate", { duration: formatDurationText(min, locale) })
      : t("range", {
          min: formatDurationText(min, locale),
          max: formatDurationText(max, locale),
        });
  }

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  // Survives a switch to automatic so unchecking restores the number the user set,
  // rather than dropping them back on an arbitrary default.
  const [manualFrames, setManualFrames] = useState(DEFAULT_MANUAL_FRAMES);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/settings");
        const json: SettingsResponse = await res.json();
        if (cancelled) return;
        setData(json);
        if (json.settings.frameCount !== null)
          setManualFrames(json.settings.frameCount);
      } catch {
        // Leaves the skeleton up; the rest of the page still works.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const auto = data?.settings.frameCount === null;
  // The slider tracks the local value, not the persisted one: during a drag
  // nothing has been saved yet, and reading from the saved value would pull
  // the thumb back under the pointer on every frame.
  const sliderValue = manualFrames;
  // Only four widths are offered, so a step is a discrete jump. Committing on
  // every step is fine here; the slider cannot travel far enough to spam.
  const widthIndex = Math.max(
    0,
    FRAME_WIDTHS.indexOf(
      (data?.settings.frameWidth ?? 0) as (typeof FRAME_WIDTHS)[number],
    ),
  );
  // What the duration tiers average out to across the pending videos.
  const autoAverage =
    data && data.pending.count > 0
      ? (data.pending.autoFrames / data.pending.count).toFixed(1)
      : "0";

  async function patch(next: Partial<TagSettings>) {
    if (!data) return;
    if (typeof next.frameCount === "number") setManualFrames(next.frameCount);
    const previous = data;
    // Applied straight away so the estimate below reacts to the click; the
    // server's normalized answer replaces it a moment later.
    setData({ ...data, settings: { ...data.settings, ...next } });
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setData(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <HelpTip side="right">{t("help")}</HelpTip>
          {saving && (
            <span className="ml-auto text-muted-foreground">{t("saving")}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!data ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-1/2" />
          </>
        ) : (
          <>
            <Field>
              <FieldLabel id="tag-language-label">
                {t("tagLanguage")}
              </FieldLabel>
              <Select
                items={languageItems}
                value={data.settings.tagLanguage}
                disabled={saving}
                onValueChange={(value) => {
                  if (value === "auto" || isAppLocale(value))
                    patch({ tagLanguage: value });
                }}
              >
                <SelectTrigger
                  aria-labelledby="tag-language-label"
                  aria-describedby="tag-language-help"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {languageItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription id="tag-language-help">
                {t("tagLanguageHelp")}
              </FieldDescription>
            </Field>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{t("strategy")}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {STRATEGIES.map((s) => {
                  const active = data.settings.strategy === s.value;
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => patch({ strategy: s.value })}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Icon className="size-4" />
                        {t(s.label)}
                        {active && (
                          <Badge variant="secondary">{t("current")}</Badge>
                        )}
                      </span>
                      <span
                        className={cn(
                          "leading-relaxed",
                          active
                            ? "text-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {t(s.blurb)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    id="frame-count-label"
                    className="flex items-center gap-1 text-sm font-medium"
                  >
                    {t("countLabel")}
                    <HelpTip>{t("autoHelp")}</HelpTip>
                  </span>
                  <label className="ml-auto flex items-center gap-1.5">
                    <Checkbox
                      checked={auto}
                      onCheckedChange={(checked) =>
                        patch({ frameCount: checked ? null : manualFrames })
                      }
                    />
                    {t("automatic")}
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    min={FRAME_COUNT_MIN}
                    max={FRAME_COUNT_MAX}
                    step={1}
                    disabled={auto}
                    value={[sliderValue]}
                    // Dragging only moves the local value. Persisting on every
                    // step would issue a request per pixel of travel.
                    onValueChange={(values) => {
                      const next = Array.isArray(values) ? values[0] : values;
                      if (!auto && next !== undefined) setManualFrames(next);
                    }}
                    // Guarded because the slider also reports its value on
                    // mount. Without this, opening the page would overwrite
                    // automatic with whatever number the disabled track happened to
                    // be resting on.
                    onValueCommitted={(values) => {
                      const next = Array.isArray(values) ? values[0] : values;
                      if (
                        next === undefined ||
                        auto ||
                        next === data.settings.frameCount
                      )
                        return;
                      patch({ frameCount: next });
                    }}
                    aria-labelledby="frame-count-label"
                    className="flex-1"
                  />
                  {/* Under automatic the checkbox already says so; the useful thing
                      to report is what the tiers actually work out to. */}
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                    {auto
                      ? t("average", { count: autoAverage })
                      : t("frames", { count: sliderValue })}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span
                  id="frame-width-label"
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {t("width")}
                  <HelpTip>{t("widthHelp")}</HelpTip>
                </span>
                <div className="flex items-center gap-3">
                  {/* The widths are a fixed set rather than a continuous range,
                      so the slider travels over their positions and the value
                      is read back out of the list. */}
                  <Slider
                    min={0}
                    max={FRAME_WIDTHS.length - 1}
                    step={1}
                    value={[widthIndex]}
                    onValueChange={(values) => {
                      const index = Array.isArray(values) ? values[0] : values;
                      const next =
                        index === undefined ? undefined : FRAME_WIDTHS[index];
                      if (
                        next === undefined ||
                        next === data.settings.frameWidth
                      )
                        return;
                      patch({ frameWidth: next });
                    }}
                    aria-labelledby="frame-width-label"
                    className="flex-1"
                  />
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                    {data.settings.frameWidth} px
                  </span>
                </div>
              </div>
            </div>

            {/* The whole point of the choice, stated in the unit that hurts. */}
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">
                {t("estimate", {
                  count: data.pending.count,
                  duration: formatDurationText(data.pending.seconds, locale),
                })}
              </div>
              <div className="flex flex-col gap-1">
                {STRATEGIES.map((s) => {
                  const cost = extractionCost(
                    s.value,
                    data.settings,
                    data.pending,
                  );
                  const active = data.settings.strategy === s.value;
                  return (
                    <div
                      key={s.value}
                      className={cn(
                        "flex items-baseline gap-3 text-sm",
                        !active && "text-muted-foreground",
                      )}
                    >
                      <span className="w-20 shrink-0">{t(s.label)}</span>
                      <span
                        className={cn("tabular-nums", active && "font-medium")}
                      >
                        {formatRange(cost)}
                      </span>
                      {active && (
                        <Badge variant="secondary">{t("current")}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="leading-relaxed text-muted-foreground">
                {t("estimateHelp")}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
