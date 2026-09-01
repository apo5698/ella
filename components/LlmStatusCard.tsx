"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plug, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import HelpTip from "@/components/HelpTip";
import { cn } from "@/lib/utils";
import type { LlmProbe } from "@/lib/llm";
import type { LlmSettings } from "@/lib/settings";
import type { LlmStatusResponse } from "@/app/api/llm-status/route";

/**
 * The page keeps probing on its own, so starting the model server is enough to
 * bring the card back without touching anything here. Retries are brisk while
 * disconnected and slow once connected, where the same server may be busy
 * running inference.
 */
const DISCONNECTED_POLL_MS = 3000;
const CONNECTED_POLL_MS = 15000;

/** How often the ring redraws while counting down. */
const SWEEP_STEP_MS = 100;

function CountdownRing({ value }: { value: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="-rotate-90"
      role="img"
      aria-label="距离下次测速"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-20"
      />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="100"
        strokeDashoffset={100 - value}
      />
    </svg>
  );
}

export default function LlmStatusCard() {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [probe, setProbe] = useState<LlmProbe | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  /** True while a probe is in flight, which is when the ring gives way to the spinner. */
  const [probing, setProbing] = useState(false);
  /** Length of the current wait, so the ring sweeps at the right speed. */
  const [cycleMs, setCycleMs] = useState(DISCONNECTED_POLL_MS);
  /** When the current wait began; the ring reads its fill from this. */
  const [cycleStartedAt, setCycleStartedAt] = useState(0);
  const [sweep, setSweep] = useState(0);
  // Read by the poll, which must not clobber a save that is still in flight.
  const busyRef = useRef(false);

  // Drives the ring. Kept apart from the poll so the countdown redraws often
  // while the network request happens at most once per interval.
  useEffect(() => {
    if (cycleStartedAt === 0) return;
    const id = setInterval(() => {
      setSweep(Math.min(100, ((Date.now() - cycleStartedAt) / cycleMs) * 100));
    }, SWEEP_STEP_MS);
    return () => clearInterval(id);
  }, [cycleStartedAt, cycleMs]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick(first: boolean) {
      let reachable = false;
      setProbing(true);
      try {
        const res = await fetch("/api/llm-status");
        const data: LlmStatusResponse = await res.json();
        if (cancelled) return;
        reachable = data.probe.reachable;
        // A save in flight owns the state; a poll that started before it must
        // not overwrite the newer answer with an older one.
        if (!busyRef.current) setProbe(data.probe);
        // The address and model are only ever adopted from the server on the
        // first pass. Later passes would fight whatever is being typed.
        if (first) {
          setSettings(data.settings);
          setUrl(data.settings.url);
        }
      } catch {
        // Offline or mid-restart. The next tick retries.
      }
      if (cancelled) return;
      setProbing(false);

      const wait = reachable ? CONNECTED_POLL_MS : DISCONNECTED_POLL_MS;
      setCycleMs(wait);
      setSweep(0);
      setCycleStartedAt(Date.now());
      timer = setTimeout(() => tick(false), wait);
    }

    tick(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  /** Saves the address and reports what it answers with. */
  async function connect() {
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/llm-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: LlmStatusResponse = await res.json();
      setSettings(data.settings);
      setProbe(data.probe);
      setUrl(data.settings.url);
    } catch {
      // The probe result already carries any failure worth showing.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function selectModel(model: string) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, model });
    try {
      const res = await fetch("/api/llm-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const data: LlmStatusResponse = await res.json();
      setSettings(data.settings);
      setProbe(data.probe);
    } catch {
      setSettings(previous);
    }
  }

  const ids = probe?.modelIds ?? [];
  const dirty = settings !== null && url.replace(/\/+$/, "") !== settings.url;
  // Switching servers keeps the saved model name, which the new server may not
  // offer. Saying so beats showing a value that will fail at request time.
  const modelMissing =
    settings !== null && ids.length > 0 && !ids.includes(settings.model);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          模型服务
          <HelpTip side="right">
            任何兼容 OpenAI 接口的服务均可使用，需提供 /models 与
            /chat/completions。识别所需的画面仅发送至该地址。
          </HelpTip>
          {probe && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                probe.reachable
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-destructive/10 text-destructive border-destructive/30",
              )}
            >
              {probe.reachable ? <Check /> : <X />}
              {probe.reachable ? "已连接" : "未连接"}
              {probe.latencyMs !== null && probe.reachable && (
                <span className="tabular-nums">{probe.latencyMs} ms</span>
              )}
              {probing ? <Spinner /> : <CountdownRing value={sweep} />}
            </Badge>
          )}
          {/* Otherwise a stopped server looks like something the user has to
              click to recover from. */}
          {probe && !probe.reachable && (
            <span className="font-normal text-muted-foreground">
              自动重试中
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!settings ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-1/2" />
          </>
        ) : (
          <>
            {probe?.error && (
              <Alert variant="destructive">
                <X />
                <AlertDescription>{probe.error}</AlertDescription>
              </Alert>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel>地址</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") connect();
                    }}
                    placeholder="http://localhost:1234/v1"
                    spellCheck={false}
                    className="flex-1 font-mono"
                  />
                  <Button onClick={connect} disabled={busy || !url.trim()}>
                    <Plug data-icon="inline-start" />
                    {busy ? "连接中" : "连接"}
                  </Button>
                </div>
                {dirty && (
                  <FieldDescription>
                    {'地址已修改，点击"连接"后生效。'}
                  </FieldDescription>
                )}
              </Field>

              <Field data-invalid={modelMissing || undefined}>
                <FieldLabel>模型</FieldLabel>
                {ids.length > 0 ? (
                  <>
                    <Select
                      value={settings.model}
                      onValueChange={(v) => selectModel(v as string)}
                    >
                      <SelectTrigger
                        className="w-full font-mono"
                        aria-label="模型"
                        aria-invalid={modelMissing || undefined}
                      >
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ids.map((id) => (
                            <SelectItem
                              key={id}
                              value={id}
                              className="font-mono"
                            >
                              {id}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {modelMissing && (
                      <FieldDescription>
                        该服务未提供模型 {settings.model}，请重新选择。
                      </FieldDescription>
                    )}
                  </>
                ) : (
                  <>
                    {/* No list came back in a shape this can read, so the name is
                        typed rather than guessed at. */}
                    <Input
                      value={settings.model}
                      onChange={(e) =>
                        setSettings({ ...settings, model: e.target.value })
                      }
                      onBlur={(e) => selectModel(e.target.value)}
                      placeholder="模型名称"
                      spellCheck={false}
                      className="font-mono"
                    />
                    <FieldDescription>
                      未从响应中读取到模型列表，请手动填写模型名称。
                    </FieldDescription>
                  </>
                )}
              </Field>
            </FieldGroup>
          </>
        )}
      </CardContent>
    </Card>
  );
}
