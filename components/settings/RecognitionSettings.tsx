"use client";

import { useLocale, useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import HelpTip from "@/components/HelpTip";
import { formatDurationText } from "@/lib/format";
import LlmStatusCard from "@/components/LlmStatusCard";
import FrameSettingsCard from "@/components/FrameSettingsCard";
import type { JobEvent, JobState } from "@/lib/tagJob";
import type { TagProgress } from "@/lib/types";

/**
 * Mirrors the server's cap. Written out rather than imported because
 * lib/tagJob reaches for node:child_process, which a value import would drag
 * into the browser bundle.
 */
const LOG_LIMIT = 200;

export default function RecognitionSettings() {
  const t = useTranslations("Recognition");
  const logText = useTranslations("JobLog");
  const errorText = useTranslations("Api");
  const locale = useLocale();
  const [job, setJob] = useState<JobState | null>(null);
  const [progress, setProgress] = useState<TagProgress | null>(null);
  const [force, setForce] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // The job pushes and nothing here polls. Log lines arrive as the process
    // writes them, so a running job no longer resends its entire log several
    // times a second.
    const source = new EventSource("/api/tag-job/stream");
    let lastRunning: boolean | null = null;
    let lastIndex: number | null = null;

    // Library-wide counts come from the database rather than from the job's
    // output, so they are re-read only when the job passes a point that can
    // change them: a finished video, or a run starting or ending.
    async function loadProgress() {
      try {
        setProgress(await fetch("/api/tag-progress").then((r) => r.json()));
      } catch {
        // Leave the figure already on screen.
      }
    }

    function noteProgressPoint(running: boolean, index: number | null) {
      if (running === lastRunning && index === lastIndex) return;
      lastRunning = running;
      lastIndex = index;
      void loadProgress();
    }

    source.onmessage = (e) => {
      const event: JobEvent = JSON.parse(e.data);
      if (event.kind === "snapshot") {
        setJob(event.state);
        noteProgressPoint(
          event.state.running,
          event.state.current?.index ?? null,
        );
        return;
      }
      if (event.kind === "log") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                log: [...prev.log, ...event.lines].slice(-LOG_LIMIT),
                logSeq: event.logSeq,
              }
            : prev,
        );
        return;
      }
      setJob((prev) => (prev ? { ...prev, ...event.status } : prev));
      noteProgressPoint(
        event.status.running,
        event.status.current?.index ?? null,
      );
    };

    return () => source.close();
  }, []);

  async function start() {
    setError("");
    const res = await fetch("/api/tag-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", force }),
    });
    const data = await res.json();
    if (!data.ok) setError(data.error ?? t("startFailed"));
  }

  async function stop() {
    setError("");
    const res = await fetch("/api/tag-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    const data = await res.json();
    if (!data.ok) setError(data.error ?? t("stopFailed"));
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.tagged / progress.total) * 100)
      : 0;

  const current = job?.current ?? null;
  const overallPct = current
    ? ((current.index - 1 + current.ratio) / current.total) * 100
    : pct;
  // Across ~900 videos a whole percent is a coarse unit; show a decimal until
  // the run is far enough along for the integer to mean something.
  const overallLabel =
    overallPct < 10 ? overallPct.toFixed(1) : String(Math.round(overallPct));

  return (
    <div className="flex flex-col gap-4">
      {/* Leads the page: the tagging controls below are inert without it. */}
      <div className="flex flex-col gap-4">
        <LlmStatusCard />
        <FrameSettingsCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {t("title")}
            <HelpTip side="right">{t("description")}</HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* While a job runs the queue is the honest source for the overall
                bar, including partial credit for the video in flight. Idle,
                it falls back to how much of the library is tagged. */}
          {(progress || current) && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-foreground">
                <span>{t("overall")}</span>
                <span className="tabular-nums">
                  {current
                    ? `${current.index} / ${current.total}`
                    : t("tagged", {
                        count: progress?.tagged ?? 0,
                        total: progress?.total ?? 0,
                      })}
                </span>
                <span className="tabular-nums">{overallLabel}%</span>
                {current?.overallEtaSec != null && (
                  <span className="ml-auto tabular-nums">
                    {t("remaining", {
                      duration: formatDurationText(
                        current.overallEtaSec,
                        locale,
                      ),
                    })}
                  </span>
                )}
              </div>
              <Progress value={overallPct} aria-label={t("overallLabel")} />
            </div>
          )}

          {current && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                <span>
                  {current.phase === "infer" ? t("inference") : t("extraction")}
                </span>
                <span className="tabular-nums">
                  {Math.round(current.ratio * 100)}%
                </span>
                {current.etaSec != null && (
                  <span className="ml-auto tabular-nums">
                    {t("remaining", {
                      duration: formatDurationText(current.etaSec, locale),
                    })}
                  </span>
                )}
              </div>
              <Progress
                value={Math.round(current.ratio * 100)}
                aria-label={
                  current.phase === "infer"
                    ? t("inferenceProgress")
                    : t("extractionProgress")
                }
              />
              <div className="truncate text-foreground">{current.title}</div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={force}
              onCheckedChange={(v) => setForce(Boolean(v))}
              disabled={job?.running}
            />
            {t("retag")}
          </label>

          <div className="flex items-center gap-2">
            <Button onClick={start} disabled={job?.running}>
              {job?.running ? t("running") : t("start")}
            </Button>
            {job?.running && (
              <Button variant="outline" onClick={stop}>
                {t("stop")}
              </Button>
            )}
            {job && !job.running && job.finishedAt && (
              <span className="text-muted-foreground">
                {t("exit", { code: job.exitCode ?? 0 })}
              </span>
            )}
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          {job && job.log.length > 0 && (
            <div>
              <div className="mb-1.5 text-muted-foreground">{t("logs")}</div>
              <pre className="h-72 overflow-auto rounded-lg bg-muted p-3 leading-relaxed whitespace-pre-wrap">
                {job.log
                  .slice(-60)
                  .map((entry) =>
                    typeof entry === "string"
                      ? entry
                      : logText(entry.key, {
                          ...entry.values,
                          ...(entry.error
                            ? {
                                error: errorText(
                                  entry.error.code,
                                  entry.error.values,
                                ),
                              }
                            : {}),
                        }),
                  )
                  .join("\n")}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
