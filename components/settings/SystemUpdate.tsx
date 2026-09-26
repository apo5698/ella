"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GhostIcon, ListChecksIcon, LoaderCircleIcon } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import {
  compareVersions,
  RELEASES_URL,
  type ReleaseStatus,
} from "@/lib/releases";
import type { UpdaterUnavailableReason, UpdateStatus } from "@/lib/updater";

const UPDATE_GUIDE_URL =
  "https://github.com/apo5698/ella/blob/main/docs/updates.md";

export default function SystemUpdate({
  currentVersion,
  initialRelease,
}: {
  currentVersion: string;
  initialRelease: ReleaseStatus;
}) {
  const t = useTranslations("SystemUpdate");
  const [release, setRelease] = useState(initialRelease);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] =
    useState<UpdaterUnavailableReason>("unreachable");
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  // An update restarts the service, which would cut running tasks off.
  const runningTasks = useTaskQueue().jobs.filter(
    (job) => job.status === "running",
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 20 * 60 * 1000;
    async function poll() {
      try {
        const response = await fetch("/api/system/update", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error();
        const data: {
          available: boolean;
          currentVersion: string;
          update: UpdateStatus | null;
          reason?: UpdaterUnavailableReason;
        } = await response.json();
        if (stopped) return;
        setAvailable(data.available);
        if (data.reason) setUnavailableReason(data.reason);
        if (data.update) {
          const active = ["pulling", "restarting"].includes(data.update.state);
          if (active) {
            setPending(true);
            setTarget(data.update.version);
            setMessage(t(data.update.state));
          } else if (data.update.state === "failed") {
            setPending(false);
            setTarget(null);
            setMessage(t("failed"));
          } else if (
            data.update.state === "succeeded" &&
            data.currentVersion === data.update.version
          ) {
            setPending(false);
            setTarget(null);
            setMessage(t("updated", { version: data.currentVersion }));
            if (data.currentVersion !== currentVersion)
              window.location.reload();
          } else if (target && data.currentVersion === target) {
            setPending(false);
            setTarget(null);
            setMessage(t("updated", { version: target }));
            window.location.reload();
          }
        }
      } catch {
        if (!stopped && target) setMessage(t("finishing"));
      }
      if (!stopped) {
        if (target && Date.now() > deadline) {
          setPending(false);
          setMessage(t("delayed"));
        } else timer = setTimeout(poll, target ? 3000 : 15000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [target, currentVersion, t]);

  async function check() {
    setChecking(true);
    try {
      const response = await fetch("/api/system/release", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const latest: ReleaseStatus = await response.json();
      setRelease(latest);
      setMessage(
        latest.status === "available"
          ? ""
          : latest.status === "empty"
            ? t("noUpdates")
            : t("checkUnavailableMessage"),
      );
    } catch {
      setMessage(t("checkFailed"));
    } finally {
      setChecking(false);
    }
  }

  async function update() {
    setPending(true);
    setMessage(t("preparing"));
    try {
      const response = await fetch("/api/system/update", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        setPending(false);
        setMessage(data.error);
        return;
      }
      setTarget(data.update.version);
      setMessage(t(data.update.state));
    } catch {
      // The container can restart before the acceptance response arrives.
      if (release.status === "available") setTarget(release.version);
      setMessage(t("confirming"));
    }
  }

  const newer =
    release.status === "available" &&
    compareVersions(currentVersion, release.version) === -1;
  const busy = pending || checking;
  const displayedVersion =
    pending && target
      ? target
      : newer && release.status === "available"
        ? release.version
        : currentVersion;
  const description = checking
    ? t("checkingUpdates")
    : message ||
      (pending
        ? t("updating")
        : newer
          ? t("available", { version: currentVersion })
          : release.status === "available"
            ? t("upToDate")
            : release.status === "empty"
              ? t("noUpdates")
              : t("checkUnavailable"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-4 sm:grid-cols-[auto_1fr_auto]">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <GhostIcon aria-hidden="true" className="size-6 text-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">
            {APP_NAME} {displayedVersion}
          </h2>
          <p role="status" className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          className="col-span-2 sm:col-span-1"
          variant={newer ? "default" : "secondary"}
          onClick={() => void (newer ? update() : check())}
          disabled={
            busy || (newer && (available !== true || runningTasks.length > 0))
          }
        >
          {busy && (
            <LoaderCircleIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin"
            />
          )}
          {pending
            ? t("updating")
            : checking
              ? t("checking")
              : newer
                ? t("updateNow")
                : t("check")}
        </Button>
        {release.status === "available" && !busy && (
          <a
            href={release.url || RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="col-start-2 w-fit text-xs text-primary underline-offset-4 hover:underline"
          >
            {t("releaseNotes")}
          </a>
        )}
        {newer && available === true && !pending && runningTasks.length > 0 && (
          <Alert className="col-span-full">
            <ListChecksIcon />
            <AlertTitle>
              {t("tasksRunning", { count: runningTasks.length })}
            </AlertTitle>
            <AlertDescription>
              {t("tasksRunningDescription")}{" "}
              <Link
                href={
                  runningTasks.some((job) => job.kind === "VIDEO_DOWNLOAD")
                    ? "/admin/utilities/downloader"
                    : "/admin/notifications"
                }
              >
                {t("viewTasks")}
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {newer && available === false && !pending && (
          <p className="col-span-full text-xs text-muted-foreground">
            {t(`unavailable.${unavailableReason}`)}{" "}
            <a
              href={UPDATE_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("updateGuide")}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
