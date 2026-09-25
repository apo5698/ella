"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  CheckIcon,
  CircleCheckIcon,
  ArrowRightIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { BaiduSetupStatus } from "@/lib/utilities/baiduSetup";

function SetupHelp({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Accordion>
      <AccordionItem value="help">
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

type SetupState = "ready" | "pending" | "attention";

/** One reading of a requirement, identical wherever the wizard shows it. */
function SetupStatus({ state }: { state: SetupState }) {
  const t = useTranslations("BaiduSetup");
  return (
    <Badge
      variant={
        state === "ready"
          ? "secondary"
          : state === "pending"
            ? "outline"
            : "destructive"
      }
      className={cn(
        state === "ready" && "bg-success/10 text-success dark:bg-success/20",
      )}
    >
      {state === "ready" ? (
        <CircleCheckIcon aria-hidden="true" />
      ) : state === "attention" ? (
        <TriangleAlertIcon aria-hidden="true" />
      ) : null}
      {t(
        state === "ready"
          ? "available"
          : state === "pending"
            ? "installPending"
            : "unavailable",
      )}
    </Badge>
  );
}

/**
 * Prepares BaiduPCS-Go and connects a Baidu Netdisk account. Any download
 * source hosted on Baidu Netdisk depends on this one connection.
 */
export default function BaiduSetupWizard({
  children,
}: {
  children?: ReactNode;
}) {
  const t = useTranslations("BaiduSetup");
  const utilities = useTranslations("Utilities");
  const [status, setStatus] = useState<BaiduSetupStatus | null>(null);
  const [step, setStep] = useState(1);
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cookies, setCookies] = useState("");
  const environmentReady =
    status?.installed && status.mediaTools && status.storageWritable;
  const ready = environmentReady && status?.account;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/utilities/baidu/setup", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<BaiduSetupStatus>;
      })
      .then((next) => {
        setStatus(next);
        const prepared =
          next.installed && next.mediaTools && next.storageWritable;
        setStep(prepared ? (next.account ? 3 : 2) : 1);
        setExpanded(!(prepared && next.account));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t("loadFailed"));
      });
    return () => controller.abort();
  }, [t]);

  async function action(name: "install" | "connect" | "verify" | "refresh") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/utilities/baidu/setup",
        name === "refresh"
          ? { cache: "no-store" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: name,
                ...(name === "connect" ? { cookies } : {}),
              }),
            },
      );
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || t("loadFailed"));
      setStatus(next);
      if (name === "connect") {
        setCookies("");
        setStep(3);
      } else if (name === "verify") {
        if (
          next.installed &&
          next.mediaTools &&
          next.storageWritable &&
          next.account
        )
          setExpanded(false);
        else setStep(1);
      } else if (next.installed && next.mediaTools && next.storageWritable)
        setStep(next.account ? 3 : 2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const steps = ["environment", "account", "finish"] as const;
  const storageMessage =
    status?.storageIssue === "readOnly"
      ? "storageReadOnly"
      : status?.storageIssue === "permission"
        ? "storagePermission"
        : status?.storageIssue === "missing"
          ? "storageMissing"
          : "storageUnavailable";
  const checks = status
    ? [
        {
          label: "downloader",
          ok: status.installed,
          automatic: status.canInstall,
          help: !status.installed && !status.canInstall ? "platformHelp" : null,
        },
        {
          label: "mediaTools",
          ok: status.mediaTools,
          automatic: false,
          help: !status.mediaTools ? "mediaHelp" : null,
        },
        {
          label: "storage",
          ok: status.storageWritable,
          automatic: false,
          help: !status.storageWritable ? storageMessage : null,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <Card className="w-full gap-0 py-0">
        {expanded ? (
          <>
            <CardHeader className="border-b py-5">
              <ol
                className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-0"
                aria-label={t("steps")}
              >
                {steps.map((label, index) => {
                  const current = step === index + 1;
                  const complete = step > index + 1;
                  return (
                    <li
                      key={label}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "relative flex min-w-0 items-center justify-center sm:justify-start",
                        index < 2 && "flex-1",
                      )}
                    >
                      <span
                        className={cn(
                          "flex shrink-0 flex-col items-center gap-1.5 text-[11px] sm:flex-row sm:gap-2 sm:text-sm",
                          current
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                            current
                              ? "border border-dashed border-primary bg-primary/5 text-primary"
                              : complete
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {complete ? (
                            <CheckIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            index + 1
                          )}
                        </span>
                        {t(`${label}Short`)}
                      </span>
                      {index < 2 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute left-[calc(50%+16px)] top-3 h-px w-[calc(100%-24px)] sm:static sm:mx-3 sm:w-auto sm:flex-1",
                            complete ? "bg-primary/40" : "bg-border",
                          )}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 py-5">
              <div className="flex flex-col gap-1">
                <CardTitle>
                  <h2>{t(steps[step - 1])}</h2>
                </CardTitle>
                <CardDescription>
                  {t(`${steps[step - 1]}Description`)}
                </CardDescription>
              </div>
              {!status && !error && (
                <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Spinner />
                  {t("checking")}
                </p>
              )}
              {status && step === 1 && (
                <ul className="divide-y">
                  {checks.map(({ label, ok, automatic, help }) => (
                    <li
                      key={label}
                      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <FieldLabel>{t(label)}</FieldLabel>
                        <SetupStatus
                          state={
                            ok ? "ready" : automatic ? "pending" : "attention"
                          }
                        />
                      </div>
                      {help && <FieldDescription>{t(help)}</FieldDescription>}
                      {label === "storage" && !ok && (
                        <SetupHelp title={t("storageFixGuide")}>
                          <div className="flex flex-col gap-4">
                            <p>{t("storageFixWhere")}</p>
                            <section className="flex flex-col gap-2">
                              <h3 className="font-medium text-foreground">
                                {t("storageFixDocker")}
                              </h3>
                              <ol className="flex list-decimal flex-col gap-2 pl-4">
                                <li>{t("storageFixDockerFile")}</li>
                                <li>
                                  {t("storageFixDockerMount")} <code>:ro</code>{" "}
                                  → <code>:rw</code>.
                                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-foreground">
                                    <code>/your/video-folder:/videos:rw</code>
                                  </pre>
                                </li>
                                <li>
                                  {t("storageFixDockerApply")}
                                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-foreground">
                                    <code>
                                      docker compose up -d --force-recreate app
                                    </code>
                                  </pre>
                                </li>
                              </ol>
                            </section>
                            <section className="flex flex-col gap-2">
                              <h3 className="font-medium text-foreground">
                                {t("storageFixHost")}
                              </h3>
                              <ol className="flex list-decimal flex-col gap-2 pl-4">
                                <li>
                                  {t("storageFixHostFind")}
                                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-foreground">
                                    <code>
                                      findmnt -T /your/video-folder -o
                                      TARGET,OPTIONS
                                    </code>
                                  </pre>
                                </li>
                                <li>
                                  {t("storageFixHostMount")}
                                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-foreground">
                                    <code>
                                      sudo mount -o remount,rw /your/mount-point
                                    </code>
                                  </pre>
                                </li>
                                <li>{t("storageFixNas")}</li>
                              </ol>
                            </section>
                            <section className="flex flex-col gap-2">
                              <h3 className="font-medium text-foreground">
                                {t("storageFixOther")}
                              </h3>
                              <p>{t("storageFixPermissions")}</p>
                              <p>{t("storageFixMissing")}</p>
                            </section>
                            <p className="font-medium text-foreground">
                              {t("storageFixRecheck")}
                            </p>
                          </div>
                        </SetupHelp>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {status && step === 2 && (
                <>
                  <Field>
                    <FieldLabel htmlFor="baidu-cookies">
                      {t("cookies")}
                    </FieldLabel>
                    <Input
                      id="baidu-cookies"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={cookies}
                      onChange={(event) => setCookies(event.target.value)}
                      disabled={busy}
                    />
                    <FieldDescription>{t("cookieHelp")}</FieldDescription>
                  </Field>
                  <SetupHelp title={t("cookieGuide")}>
                    <ol className="flex list-decimal flex-col gap-3 pl-4">
                      <li>
                        <a
                          href="https://pan.baidu.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-link hover:underline"
                        >
                          {t("openBaidu")}
                        </a>
                      </li>
                      <li>{t("cookieInstructions")}</li>
                      <li>{t("pasteInstructions")}</li>
                    </ol>
                  </SetupHelp>
                </>
              )}
              {status && step === 3 && (
                <>
                  <dl className="divide-y rounded-lg border px-4">
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-muted-foreground">
                        {t("accountShort")}
                      </dt>
                      <dd className="text-sm font-medium">
                        {status.account?.name}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-muted-foreground">
                        {t("environmentShort")}
                      </dt>
                      <dd>
                        <SetupStatus
                          state={environmentReady ? "ready" : "attention"}
                        />
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("finishHelp")}
                  </p>
                </>
              )}
            </CardContent>
          </>
        ) : (
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <CircleCheckIcon
                className="size-5 shrink-0 text-success"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-sm font-medium">{utilities("baidu")}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {t("connected", { name: status?.account?.name || "" })}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExpanded(true);
                setStep(1);
              }}
            >
              {t("manage")}
            </Button>
          </CardHeader>
        )}
        {error && (
          <CardContent className="pb-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
        {expanded && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t py-4">
            <div className="flex items-center gap-1">
              {step > 1 ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setStep(step - 1);
                  }}
                >
                  {t("back")}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => action("refresh")}
                >
                  {t("recheck")}
                </Button>
              )}
              {step === 3 && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  {t("changeAccount")}
                </Button>
              )}
            </div>
            {status && (
              <Button
                disabled={
                  busy ||
                  (step === 1 && !status.installed && !status.canInstall) ||
                  (step === 2 && !cookies.trim())
                }
                onClick={() => {
                  if (step === 1) {
                    if (environmentReady) setStep(status.account ? 3 : 2);
                    else void action("install");
                  } else void action(step === 2 ? "connect" : "verify");
                }}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {t(
                  step === 1
                    ? environmentReady
                      ? "next"
                      : "prepare"
                    : step === 2
                      ? "connect"
                      : "complete",
                )}
                {!busy && <ArrowRightIcon data-icon="inline-end" />}
              </Button>
            )}
          </CardFooter>
        )}
      </Card>
      {ready && !expanded && children}
    </div>
  );
}
