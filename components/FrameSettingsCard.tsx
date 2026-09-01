"use client";

import { useEffect, useState } from "react";
import { ScanSearch, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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

/**
 * Seconds to seek to one timestamp and write one JPEG. Measured over the SMB
 * share at 512px: five grabs from a 17-minute file took 584ms in total.
 * ffmpeg seeks to the nearest keyframe before opening the stream, so the cost
 * barely moves with how far into the file the timestamp sits.
 */
const SEEK_SEC = 0.117;

const [FRAME_COUNT_MIN, FRAME_COUNT_MAX] = FRAME_COUNT_RANGE;
/** Where the slider starts when the user first turns 自动 off. */
const DEFAULT_MANUAL_FRAMES = 6;

const STRATEGIES: {
  value: FrameStrategy;
  label: string;
  icon: typeof ScanSearch;
  blurb: string;
}[] = [
  {
    value: "scene",
    label: "场景检测",
    icon: ScanSearch,
    blurb:
      "解码完整文件并评估画面变化，分段选取变化最显著的帧。选帧质量高，耗时较长。",
  },
  {
    value: "fixed",
    label: "固定时间点",
    icon: Timer,
    blurb:
      "按等分比例定位时间点直接抽帧，不解码完整文件。速度显著提升，所选画面不保证具有代表性。",
  },
];

/**
 * What extraction alone would cost for everything still untagged, as a range.
 *
 * Inference is deliberately excluded: it dwarfs these numbers and does not
 * depend on the strategy, so including it would bury the very difference being
 * chosen. Scene detection gets a range rather than a figure because decode
 * throughput swings about threefold across this library — quoting one number
 * would be precise and wrong.
 */
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

/**
 * These are projections over hundreds of files. Quoting them to the second
 * would claim an accuracy they do not have, so anything above a minute is
 * rounded to the minute. The live countdowns elsewhere keep their seconds.
 */
function coarsen(sec: number): number {
  return sec < 60 ? sec : Math.round(sec / 60) * 60;
}

function formatRange(cost: { min: number; max: number }): string {
  const min = coarsen(cost.min);
  const max = coarsen(cost.max);
  // Within a few percent the range is noise; show it as one figure.
  if (max - min < min * 0.1) return `约 ${formatDurationText(min)}`;
  return `约 ${formatDurationText(min)} 至 ${formatDurationText(max)}`;
}

export default function FrameSettingsCard() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  // Survives a switch to 自动 so unchecking restores the number the user set,
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
          抽帧设置
          <HelpTip side="right">
            {
              '控制送入模型的帧选取方式、数量与尺寸。设置对"重新识别"与批量任务同时生效。批量任务于启动时读取设置。'
            }
          </HelpTip>
          {saving && (
            <span className="ml-auto text-muted-foreground">保存中…</span>
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
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium">抽帧方式</div>
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
                        {s.label}
                        {active && <Badge variant="secondary">当前</Badge>}
                      </span>
                      <span
                        className={cn(
                          "leading-relaxed",
                          active
                            ? "text-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {s.blurb}
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
                    className="flex items-center gap-1 text-xs font-medium"
                  >
                    每视频帧数
                    <HelpTip>
                      {
                        '"自动"按时长分档：30 秒以内 2 帧，5 分钟以内 4 帧，30 分钟以内 6 帧，超过 30 分钟 8 帧。帧数同时影响推理耗时。'
                      }
                    </HelpTip>
                  </span>
                  <label className="ml-auto flex items-center gap-1.5">
                    <Checkbox
                      checked={auto}
                      onCheckedChange={(checked) =>
                        patch({ frameCount: checked ? null : manualFrames })
                      }
                    />
                    自动
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
                    // 自动 with whatever number the disabled track happened to
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
                  {/* Under 自动 the checkbox already says so; the useful thing
                      to report is what the tiers actually work out to. */}
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                    {auto ? `平均 ${autoAverage} 帧` : `${sliderValue} 帧`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span
                  id="frame-width-label"
                  className="flex items-center gap-1 text-xs font-medium"
                >
                  画面宽度
                  <HelpTip>
                    送入模型的图像宽度，直接影响推理耗时。数值越大细节越清晰，耗时越长。
                  </HelpTip>
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
              <div className="text-xs font-medium">
                待识别 {data.pending.count} 个视频（共{" "}
                {formatDurationText(data.pending.seconds)}）的抽帧耗时
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
                      <span className="w-20 shrink-0">{s.label}</span>
                      <span
                        className={cn("tabular-nums", active && "font-medium")}
                      >
                        {formatRange(cost)}
                      </span>
                      {active && <Badge variant="secondary">当前</Badge>}
                    </div>
                  );
                })}
              </div>
              <div className="leading-relaxed text-muted-foreground">
                不含模型推理耗时。场景检测的区间对应解码速度 28 至 135
                倍实时，随编码格式与磁盘缓存变化。
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
