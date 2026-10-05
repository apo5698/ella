"use client";

import { useLocale, useTranslations } from "next-intl";
import { wordGap } from "@/lib/format";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  DownloadSourcesError,
  DownloadSourcesResponse,
} from "@/app/api/admin/utilities/download-sources/route";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import JsonCodeEditor from "@/components/settings/JsonCodeEditor";
import {
  createDownloadSourcesJsonSchema,
  type DownloadSourceSchemaText,
} from "@/lib/utilities/downloadSources";

const ENDPOINT = "/api/admin/utilities/download-sources";
const FORMAT_GUIDE_URL =
  "https://github.com/apo5698/ella/blob/main/docs/download-sources.md";

const SCHEMA_TEXT = [
  "id",
  "name",
  "description",
  "transport",
  "layers",
  "password",
  "onUnexpectedLayout",
  "transportHttp",
  "transportBaiduShare",
  "retain",
  "fail",
  "snippetHttp",
  "snippetShare",
] as const satisfies (keyof DownloadSourceSchemaText)[];

const format = (data: DownloadSourcesResponse) =>
  JSON.stringify(data.sources, null, 2);

/** The download sources as one JSON document, checked on the server. */
export default function DownloadSourcesEditor() {
  const t = useTranslations("DownloadSources");
  const gap = wordGap(useLocale());
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<DownloadSourcesError | null>(null);
  const schema = useMemo(
    () =>
      createDownloadSourcesJsonSchema(
        Object.fromEntries(
          SCHEMA_TEXT.map((key) => [key, t(`schema.${key}`)]),
        ) as DownloadSourceSchemaText,
      ),
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<DownloadSourcesResponse>)
      .then((data) => {
        setSaved(format(data));
        setText(format(data));
      })
      .catch(() => {
        if (!controller.signal.aborted) setProblem({ error: t("loadFailed") });
      });
    return () => controller.abort();
  }, [t]);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setProblem(
          (data as DownloadSourcesError | null) ?? { error: t("saveFailed") },
        );
        return;
      }
      const next = format(data as DownloadSourcesResponse);
      setSaved(next);
      setText(next);
      toast.success(t("saved"));
    } catch {
      setProblem({ error: t("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
          {gap}
          <a
            href={FORMAT_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("formatGuide")}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {saved === null ? (
          !problem && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner />
              {t("loading")}
            </p>
          )
        ) : (
          <JsonCodeEditor
            value={text}
            schema={schema}
            label={t("title")}
            loadingLabel={t("loading")}
            disabled={saving}
            onChange={(next) => {
              setText(next);
              setProblem(null);
            }}
            onSave={() => {
              if (!saving && text !== saved) void save();
            }}
          />
        )}
        {problem && (
          <Alert variant="destructive">
            <AlertTitle>{problem.error}</AlertTitle>
            {problem.issues && (
              <AlertDescription>
                <ul className="list-disc pl-4 font-mono text-xs">
                  {problem.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          variant="outline"
          disabled={saving || saved === null || text === saved}
          onClick={() => {
            setText(saved ?? "");
            setProblem(null);
          }}
        >
          {t("revert")}
        </Button>
        <Button
          disabled={saving || saved === null || text === saved}
          onClick={() => void save()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
