"use client";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import { Undo2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dot } from "@/components/ui/dot";
import { RemovableSeriesBadge } from "@/components/tags/TagBadge";
import {
  SOURCE_LABEL,
  sourceDotStyle,
} from "@/components/tags/tag-presentation";
import { FieldLabel } from "@/components/ui/field";
import TagAutocomplete, { type Option } from "@/components/TagAutocomplete";
import HelpTip from "@/components/HelpTip";
import { groupTags, sortNames, sortTags } from "@/lib/tagOrder";
import TagChip from "./TagChip";
import type { VideoDetailTag, VideoTagState } from "@/lib/types";

export default function TagEditor({
  initialTags,
  initialRejected = [],
  initialSeries = null,
  onChange,
}: {
  initialTags: VideoDetailTag[];
  initialRejected?: string[];
  initialSeries?: string | null;
  onChange?: (state: VideoTagState) => void;
}) {
  const t = useTranslations("TagEditor");
  const labels = useTranslations("TagLabels");
  const [tags, setTags] = useState<VideoDetailTag[]>(initialTags);
  const [rejected, setRejected] = useState<string[]>(initialRejected);
  const [series, setSeries] = useState<string | null>(initialSeries);
  const temporaryId = useRef(-1);

  useEffect(() => {
    onChange?.({ tags, rejectedTags: rejected, seriesName: series });
  }, [onChange, rejected, series, tags]);

  function setSeriesName(name: string | null) {
    setSeries(name);
  }

  function addTag(name: string, option: Option) {
    const clean = name.trim();
    if (!clean) return;
    setTags((prev) =>
      sortTags([
        ...prev.filter((t) => t.name !== clean),
        {
          id: option.id ?? temporaryId.current--,
          name: clean,
          source: "manual",
          path: [clean],
        },
      ]),
    );
    // Adding a tag back clears any earlier rejection of it.
    setRejected((prev) => prev.filter((r) => r !== clean));
  }

  function removeTag(name: string) {
    const tag = tags.find((t) => t.name === name);
    setTags((prev) => prev.filter((t) => t.name !== name));
    // Generated tags become negative examples rather than disappearing.
    if (tag && tag.source !== "manual") {
      setRejected((prev) =>
        prev.includes(name) ? prev : sortNames([...prev, name]),
      );
    }
  }

  /** The Save action promotes the tag after this local preview. */
  function acceptTag(name: string) {
    setTags((prev) =>
      sortTags(
        prev.map((t) => (t.name === name ? { ...t, source: "manual" } : t)),
      ),
    );
  }

  function restoreTag(name: string) {
    setRejected((prev) => prev.filter((r) => r !== name));
    setTags((prev) =>
      prev.some((t) => t.name === name)
        ? prev
        : sortTags([
            ...prev,
            {
              id: temporaryId.current--,
              name,
              source: "vision",
              path: [name],
            },
          ]),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <FieldLabel htmlFor="video-series">{t("series")}</FieldLabel>
        {/* One series per video, so the input gives way once one is set. */}
        {series ? (
          <div className="flex flex-wrap gap-1">
            <RemovableSeriesBadge
              removeLabel={t("removeNamedSeries", { name: series })}
              onClick={() => setSeriesName(null)}
              title={t("removeSeries")}
            >
              {series}
            </RemovableSeriesBadge>
          </div>
        ) : (
          <TagAutocomplete
            endpoint="/api/series/suggest"
            kind="series"
            mode="single"
            placeholder={t("setSeries")}
            onSelect={(name) => setSeriesName(name)}
            className="w-56"
            inputId="video-series"
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <FieldLabel htmlFor="video-tags">{t("tags")}</FieldLabel>
          <span className="flex items-center gap-3 text-muted-foreground">
            {(["vision", "manual"] as const).map((source) => (
              <span key={source} className="flex items-center gap-1">
                <Dot className={sourceDotStyle([source])} />
                {labels(SOURCE_LABEL[source])}
              </span>
            ))}
          </span>
        </div>

        {/* The input keeps its own row so it stays put as tags are added. */}
        <TagAutocomplete
          endpoint="/api/tags/suggest?assignable=1"
          mode="multi"
          placeholder={t("addTag")}
          disabledNames={tags.map((t) => t.name)}
          onSelect={addTag}
          className="w-56"
          inputId="video-tags"
        />

        {/* Grouped the same way the video page groups them, so a tag does not
            appear to move when the dialog is closed. */}
        <div className="flex flex-wrap items-center gap-1">
          {groupTags(tags).map((family) => (
            <div
              key={family[0].name}
              className="flex flex-wrap items-center gap-1"
            >
              {family.map((t) => (
                <TagChip
                  key={t.name}
                  name={t.name}
                  source={t.source}
                  onAccept={acceptTag}
                  onReject={removeTag}
                />
              ))}
            </div>
          ))}
          {tags.length === 0 && (
            <span className="text-muted-foreground">{t("empty")}</span>
          )}
        </div>
      </section>

      {rejected.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FieldLabel>{t("excluded")}</FieldLabel>
            <HelpTip>{t("excludedHelp")}</HelpTip>
          </div>
          <div className="flex flex-wrap gap-1">
            {rejected.map((name) => (
              <Badge
                key={name}
                render={<button type="button" />}
                variant="outline"
                title={t("restore")}
                className="gap-1 cursor-pointer border-dashed text-muted-foreground line-through hover:text-foreground hover:no-underline"
                onClick={() => restoreTag(name)}
              >
                {name}
                <Undo2Icon />
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
