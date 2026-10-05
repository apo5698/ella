"use client";

import { useLocale, useTranslations } from "next-intl";
import { wordGap } from "@/lib/format";

import Link from "next/link";
import { useEffect, useState } from "react";
import { diffChars, type Change } from "diff";
import {
  ArrowRightIcon,
  FileDownIcon,
  FilmIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import DownloadSourceFields, {
  type DownloadFieldErrors,
  type DownloadFields,
} from "@/components/admin/DownloadSourceFields";
import {
  DOWNLOAD_SERVICES,
  DOWNLOAD_SERVICES_HREF,
  type DownloadService,
} from "@/components/admin/downloadServices";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { DownloadSourcesResponse } from "@/app/api/admin/utilities/download-sources/route";
import type { SettingsResponse } from "@/app/api/settings/route";
import type { VideoRef } from "@/lib/duplicates";
import {
  createDownloadInputSchema,
  initialDownloadValues,
  type DownloadSource,
} from "@/lib/utilities/downloadSources";
import type { DownloadFailure } from "@/lib/utilities/downloadTypes";
import { cn } from "@/lib/utils";

const FORM_ID = "new-download-form";

type Fields = DownloadFields;
type SchemaIssue = { message: string; path?: PropertyKey[] };

function DiffName({ parts }: { parts: Change[] }) {
  return parts.map((part, index) => {
    return part.added || part.removed ? (
      <mark
        key={index}
        className={cn(
          "rounded-sm px-0.5",
          part.removed
            ? "bg-destructive/15 text-destructive"
            : "bg-success/15 text-success",
        )}
      >
        {part.value}
      </mark>
    ) : (
      part.value
    );
  });
}

function SimilarNameConflict({
  requestedName,
  match,
}: {
  requestedName: string;
  match: VideoRef & { score: number };
}) {
  const t = useTranslations("Downloads");
  const diff = diffChars(match.title, requestedName);
  return (
    <Alert variant="destructive">
      <AlertTitle className="flex items-center gap-2">
        {t("similar")}
        <Badge variant="destructive" className="tabular-nums">
          {t("score", { percent: Math.round(match.score * 100) })}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <ItemGroup className="text-foreground">
          <Item role="listitem" variant="muted" size="sm">
            <ItemMedia variant="icon">
              <FilmIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("existing")}</ItemTitle>
              <ItemDescription className="line-clamp-none break-all">
                <Link href={`/video/${match.id}`} target="_blank">
                  {match.title}
                </Link>
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item role="listitem" variant="muted" size="sm">
            <ItemMedia variant="icon">
              <FileDownIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("requested")}</ItemTitle>
              <ItemDescription className="line-clamp-none break-all">
                <DiffName parts={diff} />
              </ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </AlertDescription>
    </Alert>
  );
}

function issuesByField(issues: SchemaIssue[]) {
  const errors: DownloadFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path?.[0];
    if (typeof field !== "string") continue;
    (errors[field] ??= []).push({ message: issue.message });
  }
  return errors;
}

type SetupState = "checking" | "ready" | "missing";

/**
 * Whether the service a source is hosted on is set up. Checked each time the
 * dialog opens, since the setup is done on another page.
 */
function useServiceSetup(
  service: DownloadService | undefined,
  open: boolean,
): SetupState {
  const [state, setState] = useState<{ key: string; value: SetupState }>({
    key: "",
    value: "checking",
  });
  const key = `${service?.name}:${open}`;

  useEffect(() => {
    if (!service || !open) return;
    const controller = new AbortController();
    fetch(service.statusUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) =>
        setState({
          key,
          value: status && service.isReady(status) ? "ready" : "missing",
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, value: "missing" });
      });
    return () => controller.abort();
  }, [key, open, service]);

  if (!service) return "ready";
  return state.key === key ? state.value : "checking";
}

/** The configured sources, read each time the dialog opens. */
function useDownloadSources(open: boolean) {
  const [sources, setSources] = useState<DownloadSource[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/admin/utilities/download-sources", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json() as Promise<DownloadSourcesResponse>)
      .then((data) => setSources(data.sources))
      .catch(() => {
        if (!controller.signal.aborted) setSources([]);
      });
    return () => controller.abort();
  }, [open]);

  return sources;
}

/** The Smartag page's default for recognizing downloads, read on each open. */
function useRecognizeDefault(open: boolean) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/settings", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<SettingsResponse>)
      .then((data) => setValue(data.settings.recognizeDownloads))
      .catch(() => {
        // Stays off, as the form would be without the option.
      });
    return () => controller.abort();
  }, [open]);

  return value;
}

/**
 * Creates one download. The source decides the rest of the form. The
 * request returns as soon as the task exists, and the transfer runs in the
 * task queue whether or not this page stays open.
 */
export default function NewDownloadDialog() {
  const t = useTranslations("Downloads");
  const utilities = useTranslations("Utilities");
  const common = useTranslations("Common");
  const validation = useTranslations("Api");
  const gap = wordGap(useLocale());
  const [open, setOpen] = useState(false);
  const sources = useDownloadSources(open);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const source =
    sources?.find((item) => item.id === chosenId) ?? sources?.[0] ?? null;
  // Changing the key remounts the fields, clearing any state they hold.
  const [entryId, setEntryId] = useState(1);
  // Kept per source, so the form starts from the source's own defaults.
  const [entry, setEntry] = useState<{ id: string; values: Fields } | null>(
    null,
  );
  const values =
    source && entry?.id === source.id
      ? entry.values
      : source
        ? initialDownloadValues(source)
        : { name: "" };
  const [errors, setErrors] = useState<DownloadFieldErrors | null>(null);
  const [failure, setFailure] = useState<DownloadFailure | null>(null);
  const [submitting, setSubmitting] = useState<"now" | "pending" | null>(null);
  const service =
    source?.transport === "baidu-share" ? DOWNLOAD_SERVICES.baidu : undefined;
  const setup = useServiceSetup(service, open);
  const recognizeDefault = useRecognizeDefault(open);
  // Null until the user touches the switch, so the default shows through.
  const [recognizeChoice, setRecognizeChoice] = useState<boolean | null>(null);
  const recognize = recognizeChoice ?? recognizeDefault;

  const ready = source !== null && setup === "ready";

  function changeOpen(next: boolean) {
    if (next) setRecognizeChoice(null);
    setOpen(next);
  }

  function reset() {
    setEntry(null);
    setErrors(null);
    setFailure(null);
    setEntryId((id) => id + 1);
  }

  function validate(fields: Fields) {
    if (!source) return false;
    const parsed = createDownloadInputSchema(source, validation).safeParse(
      fields,
    );
    setErrors(parsed.success ? {} : issuesByField(parsed.error.issues));
    return parsed.success;
  }

  async function submit(start: boolean) {
    if (!ready || !source || submitting || !validate(values)) return;
    setSubmitting(start ? "now" : "pending");
    setFailure(null);
    try {
      const response = await fetch("/api/admin/utilities/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source.id,
          start,
          recognize,
          fields: values,
        }),
      });
      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({}))) as Partial<DownloadFailure>;
        setFailure({
          error: data.error || t("submitFailed"),
          reason: data.reason,
          video: data.video ?? null,
        });
        return;
      }
      toast.success(t(start ? "started" : "addedPending"));
      reset();
      setOpen(false);
    } catch {
      setFailure({ error: t("submitFailed") });
    } finally {
      setSubmitting(null);
    }
  }

  const similar =
    failure?.reason === "similar" && failure.video?.score !== undefined
      ? (failure.video as VideoRef & { score: number })
      : null;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button onClick={() => changeOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        {t("new")}
      </Button>
      <DialogContent className="flex max-h-5/6 flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newDownload")}</DialogTitle>
          <DialogDescription>{t("formDescription")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
          {sources === null && (
            <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner />
              {common("loading")}
            </p>
          )}
          {sources?.length === 0 && (
            <Alert>
              <SettingsIcon />
              <AlertTitle>{t("noSources")}</AlertTitle>
              <AlertDescription>{t("noSourcesDescription")}</AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={DOWNLOAD_SERVICES_HREF} />}
                  nativeButton={false}
                >
                  {t("openSettings")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </AlertAction>
            </Alert>
          )}
          {source && sources && (
            <Field>
              <FieldLabel htmlFor="download-source">{t("source")}</FieldLabel>
              <Select
                value={source.id}
                onValueChange={(value) => {
                  if (value === source.id) return;
                  setChosenId(value as string);
                  reset();
                }}
              >
                <SelectTrigger id="download-source" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      sources.find((item) => item.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sources.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {source.description && (
                <FieldDescription>{source.description}</FieldDescription>
              )}
            </Field>
          )}
          {source && setup === "checking" && (
            <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner />
              {t("checkingSetup")}
            </p>
          )}
          {setup === "missing" && (
            <Alert>
              <SettingsIcon />
              <AlertTitle>
                {t("setupRequired", {
                  service: service ? utilities(service.name) : "",
                })}
              </AlertTitle>
              <AlertDescription>
                {t("setupRequiredDescription")}
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={DOWNLOAD_SERVICES_HREF} />}
                  nativeButton={false}
                >
                  {t("openSettings")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </AlertAction>
            </Alert>
          )}
          {ready && (
            <form
              id={FORM_ID}
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(true);
              }}
            >
              <DownloadSourceFields
                key={entryId}
                source={source}
                entryId={entryId}
                value={values}
                disabled={submitting !== null}
                errors={errors ?? {}}
                hasConflict={failure?.reason !== undefined}
                onChange={(field, value) => {
                  const next = { ...values, [field]: value };
                  setEntry({ id: source.id, values: next });
                  setFailure(null);
                  if (errors) validate(next);
                }}
              />
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="download-recognize">
                    {t("recognize")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("recognizeDescription")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="download-recognize"
                  checked={recognize}
                  disabled={submitting !== null}
                  onCheckedChange={setRecognizeChoice}
                />
              </Field>
              {similar ? (
                <SimilarNameConflict
                  requestedName={values.name}
                  match={similar}
                />
              ) : (
                failure && (
                  <Alert variant="destructive">
                    <AlertTitle>{t("submitFailed")}</AlertTitle>
                    <AlertDescription>
                      {failure.error}
                      {failure.video && (
                        <>
                          {gap}
                          <Link href={`/video/${failure.video.id}`}>
                            {t("view")}
                          </Link>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )
              )}
            </form>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!ready || submitting !== null}
            onClick={() => void submit(false)}
          >
            {submitting === "pending" && <Spinner data-icon="inline-start" />}
            {t("addPending")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!ready || submitting !== null}
          >
            {submitting === "now" && <Spinner data-icon="inline-start" />}
            {t("downloadNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
