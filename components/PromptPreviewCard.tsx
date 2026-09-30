"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import HelpTip from "@/components/HelpTip";
import { TAG_SETTINGS_EVENT } from "@/lib/settings";
import type { PromptResponse } from "@/app/api/settings/prompt/route";

/** How long the copy button shows its confirmation. */
const COPIED_MS = 1500;

/** The recognition prompt as the current library and settings build it. */
export default function PromptPreviewCard() {
  const t = useTranslations("Prompt");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      fetch("/api/settings/prompt", {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json() as Promise<PromptResponse>;
        })
        .then((data) => {
          setPrompt(data.prompt);
          setFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    };

    load();
    // The tag language lives in the frame settings card, and the vocabulary
    // changes as tags are reviewed elsewhere, so both are picked up here.
    window.addEventListener(TAG_SETTINGS_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener(TAG_SETTINGS_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // Clipboard access is refused outside a secure context; the text stays
      // selectable below.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {t("title")}
          <HelpTip side="right">{t("help")}</HelpTip>
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={copy} disabled={!prompt}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {prompt ? (
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
            {prompt}
          </pre>
        ) : failed ? (
          <div className="text-sm text-destructive">{t("loadFailed")}</div>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
