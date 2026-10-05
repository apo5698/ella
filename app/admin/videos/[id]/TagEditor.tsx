"use client";

import { useTranslations } from "next-intl";

import { useRef } from "react";
import { CheckCheckIcon, CheckIcon, Undo2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  RemovableSeriesBadge,
  RemovableTagBadge,
  TagBadge,
} from "@/components/tags/TagBadge";
import TagAutocomplete, { type Option } from "@/components/TagAutocomplete";
import HelpTip from "@/components/HelpTip";
import { sortNames, sortTags } from "@/lib/tagOrder";
import type { VideoTagState } from "@/lib/types";

/** The id of the tag input, which the page focuses from the keyboard. */
export const TAG_INPUT_ID = "video-tags";

/**
 * A video's series and tags as an editable draft. Tags the model produced
 * wait in their own group until they are accepted or excluded, so reviewing
 * them is a pass over one short list rather than a search through all of them.
 */
export default function TagEditor({
  value,
  onChange,
}: {
  value: VideoTagState;
  onChange: (next: VideoTagState) => void;
}) {
  const t = useTranslations("TagEditor");
  const common = useTranslations("Common");
  const temporaryId = useRef(-1);
  const { tags, rejectedTags: rejected, seriesName: series } = value;
  const pending = tags.filter((tag) => tag.source !== "manual");
  const approved = tags.filter((tag) => tag.source === "manual");

  function update(patch: Partial<VideoTagState>) {
    onChange({ ...value, ...patch });
  }

  function addTag(name: string, option: Option) {
    const clean = name.trim();
    if (!clean) return;
    update({
      tags: sortTags([
        ...tags.filter((tag) => tag.name !== clean),
        {
          id: option.id ?? temporaryId.current--,
          name: clean,
          source: "manual",
          path: [clean],
        },
      ]),
      // Adding a tag back clears any earlier exclusion of it.
      rejectedTags: rejected.filter((name) => name !== clean),
    });
  }

  function removeTag(name: string) {
    const tag = tags.find((item) => item.name === name);
    update({
      tags: tags.filter((item) => item.name !== name),
      // Generated tags become negative examples rather than disappearing.
      rejectedTags:
        tag && tag.source !== "manual" && !rejected.includes(name)
          ? sortNames([...rejected, name])
          : rejected,
    });
  }

  /** Generated tags become negative examples rather than disappearing. */
  function exclude(names: string[]) {
    const excluded = new Set(names);
    update({
      tags: tags.filter((tag) => !excluded.has(tag.name)),
      rejectedTags: sortNames([
        ...rejected.filter((name) => !excluded.has(name)),
        ...names,
      ]),
    });
  }

  /** Saving promotes the tag; until then this is a local preview. */
  function accept(names: string[]) {
    const accepted = new Set(names);
    update({
      tags: sortTags(
        tags.map((tag) =>
          accepted.has(tag.name) ? { ...tag, source: "manual" } : tag,
        ),
      ),
    });
  }

  function restoreTag(name: string) {
    update({
      rejectedTags: rejected.filter((item) => item !== name),
      tags: tags.some((tag) => tag.name === name)
        ? tags
        : sortTags([
            ...tags,
            {
              id: temporaryId.current--,
              name,
              source: "vision",
              path: [name],
            },
          ]),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <FieldLabel htmlFor="video-series">{common("series")}</FieldLabel>
        {/* One series per video, so the input gives way once one is set. */}
        {series ? (
          <div className="flex flex-wrap gap-1">
            <RemovableSeriesBadge
              removeLabel={t("removeNamedSeries", { name: series })}
              onClick={() => update({ seriesName: null })}
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
            placeholder={common("setSeries")}
            onSelect={(name) => update({ seriesName: name })}
            className="w-full"
            inputId="video-series"
          />
        )}
        <FieldDescription>{common("seriesNameHelp")}</FieldDescription>
      </section>

      <section className="flex flex-col gap-2">
        <FieldLabel htmlFor={TAG_INPUT_ID}>{t("tags")}</FieldLabel>
        <div className="flex min-h-5 flex-wrap items-center gap-1">
          {approved.map((tag) => (
            <RemovableTagBadge
              key={tag.name}
              source="manual"
              removeLabel={t("removeNamed", { name: tag.name })}
              onClick={() => removeTag(tag.name)}
            >
              {tag.name}
            </RemovableTagBadge>
          ))}
          {approved.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {common("noTags")}
            </span>
          )}
        </div>
        <TagAutocomplete
          endpoint="/api/tags/suggest?assignable=1"
          mode="multi"
          placeholder={t("addTag")}
          disabledNames={tags.map((tag) => tag.name)}
          onSelect={addTag}
          className="w-full"
          inputId={TAG_INPUT_ID}
        />
        <FieldDescription>{common("tagNameHelp")}</FieldDescription>
      </section>

      {/* One row per tag, with its two answers beside it rather than inside
          it, so each tag is decided on its own and the badge stays a badge. */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <FieldLabel>{t("pending", { count: pending.length })}</FieldLabel>
            <HelpTip>{t("pendingHelp")}</HelpTip>
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {pending.map((tag) => (
              <li
                key={tag.name}
                className="flex items-center gap-2 py-1 pr-1 pl-2"
              >
                <TagBadge source={tag.source} className="min-w-0 shrink">
                  <span className="truncate">{tag.name}</span>
                </TagBadge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-success hover:text-success"
                  aria-label={t("acceptNamed", { name: tag.name })}
                  onClick={() => accept([tag.name])}
                >
                  <CheckIcon data-icon="inline-start" />
                  {t("accept")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={t("excludeNamed", { name: tag.name })}
                  onClick={() => exclude([tag.name])}
                >
                  <XIcon data-icon="inline-start" />
                  {t("exclude")}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => accept(pending.map((tag) => tag.name))}
            >
              <CheckCheckIcon data-icon="inline-start" />
              {t("acceptAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exclude(pending.map((tag) => tag.name))}
            >
              <XIcon data-icon="inline-start" />
              {t("excludeAll")}
            </Button>
          </div>
        </section>
      )}

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
                className="cursor-pointer gap-1 rounded-sm border-dashed text-xs/none text-muted-foreground line-through hover:text-foreground hover:no-underline"
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
