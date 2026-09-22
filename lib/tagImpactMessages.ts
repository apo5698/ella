import { createTranslator } from "next-intl";
import english from "@/messages/en.json";
import type { ImpactedTag, TagImpactFact } from "./tagImpact";

export type TagImpactMessageSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; tag: ImpactedTag }
  | { kind: "video-count"; text: string; videoIds: number[] }
  | { kind: "children"; text: string; items: ImpactedTag[] };

export type TagImpactMessage = {
  tone: "default" | "destructive";
  segments: TagImpactMessageSegment[];
};

type Translate = (
  key: keyof typeof english.Impact,
  values?: Record<string, string | number>,
) => string;
const defaultTranslate = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Impact",
});

/** Localized sentences retain interactive segments in each language's word order. */
export function formatTagImpactFact(
  fact: TagImpactFact,
  t: Translate = defaultTranslate,
): TagImpactMessage {
  const video = (
    count: number,
    videoIds: number[] = [],
  ): TagImpactMessageSegment => ({
    kind: "video-count",
    text: t("videos", { count }),
    videoIds,
  });
  const tag = (value: ImpactedTag): TagImpactMessageSegment => ({
    kind: "tag",
    tag: value,
  });
  const children = (items: ImpactedTag[]): TagImpactMessageSegment => ({
    kind: "children",
    text: t("children", { count: items.length }),
    items,
  });
  function sentence(
    key: keyof typeof english.Impact,
    values: Record<string, string | number> = {},
    rich: Record<string, TagImpactMessageSegment> = {},
    tone: TagImpactMessage["tone"] = "default",
  ): TagImpactMessage {
    const segments = Object.values(rich);
    const placeholders = Object.fromEntries(
      Object.keys(rich).map((name, index) => [name, `\uFFF0${index}\uFFF1`]),
    );
    const rendered = t(key, { ...values, ...placeholders });
    return {
      tone,
      segments: rendered
        .split(/(\uFFF0\d+\uFFF1)/)
        .filter(Boolean)
        .map((part) => {
          const match = /^\uFFF0(\d+)\uFFF1$/.exec(part);
          return match
            ? segments[Number(match[1])]
            : { kind: "text", text: part };
        }),
    };
  }
  switch (fact.kind) {
    case "videos-lose-tags":
      return sentence(
        fact.count ? "loseTags" : "noAssignments",
        { multiple: String(fact.multipleTags) },
        { videos: video(fact.count, fact.videoIds) },
        fact.count ? "destructive" : "default",
      );
    case "classification-conflict":
      return sentence(
        fact.count ? "classificationConflict" : "noDirectAssignments",
        {},
        { videos: video(fact.count, fact.videoIds) },
        fact.count ? "destructive" : "default",
      );
    case "children-moved":
      return fact.destination.kind === "up"
        ? sentence("childrenMovedUp", {}, { children: children(fact.items) })
        : sentence(
            "childrenMoved",
            {},
            { children: children(fact.items), tag: tag(fact.destination.tag) },
          );
    case "children-unaffected":
      return sentence(
        "childrenUnaffected",
        {},
        { children: children(fact.items) },
      );
    case "rejections-deleted":
      return sentence("rejectionsDeleted", { count: fact.count });
    case "manual-links-excluded":
      return sentence(
        "manualLinksExcluded",
        { count: fact.count },
        {},
        "destructive",
      );
    case "regeneration-blocked":
      return sentence("regenerationBlocked", {
        multiple: String(fact.multipleTags),
      });
    case "restorable":
      return sentence("restorable");
    case "rejections-restored":
      return fact.count === 0
        ? sentence("noRejections", { multiple: String(fact.multipleTags) })
        : sentence(
            "rejectionsRestored",
            { count: fact.count },
            { videos: video(fact.videoCount, fact.videoIds) },
          );
    case "restore-covers-earlier":
      return sentence("restoreCoversEarlier");
    case "automatic-links-approved":
      return sentence(
        "automaticLinksApproved",
        {},
        { videos: video(fact.count, fact.videoIds) },
      );
    case "tag-made-assignable":
      return sentence("tagMadeAssignable", {}, { videos: video(0) });
    case "aliases-invalidated":
      return sentence("aliasesInvalidated", { count: fact.count });
    case "video-tags-unchanged":
      return sentence("videoTagsUnchanged");
    case "filter-gain":
      return fact.count === 0
        ? sentence("filterUnchanged", {}, { tag: tag(fact.parent) })
        : sentence(
            "filterGain",
            {},
            { tag: tag(fact.parent), videos: video(fact.count, fact.videoIds) },
          );
    case "tag-created":
      return sentence("tagCreated", {}, { tag: tag(fact.tag) });
    case "filter-loss":
      return sentence(
        "filterLoss",
        {},
        { tag: tag(fact.parent), videos: video(fact.count, fact.videoIds) },
      );
    case "already-top-level":
      return sentence("alreadyRoot");
    case "videos-retagged":
      return fact.count === 0
        ? sentence(
            "noAssignments",
            { multiple: String(fact.multipleTags) },
            { videos: video(0) },
          )
        : sentence(
            "videosRetagged",
            {},
            { videos: video(fact.count, fact.videoIds), tag: tag(fact.target) },
          );
    case "merge-overlap":
      return sentence(
        "mergeOverlap",
        {},
        { videos: video(fact.count, fact.videoIds), tag: tag(fact.target) },
      );
    case "names-become-aliases":
      return sentence(
        "namesBecomeAliases",
        { count: fact.count },
        { tag: tag(fact.target) },
      );
    case "aliases-transferred":
      return sentence(
        "aliasesTransferred",
        { count: fact.count },
        { tag: tag(fact.target) },
      );
    case "video-tag-renamed":
      return fact.count === 0
        ? sentence("noAssignments", { multiple: "false" }, { videos: video(0) })
        : sentence(
            "videoTagRenamed",
            {},
            { videos: video(fact.count, fact.videoIds), tag: tag(fact.tag) },
          );
    case "old-name-unmatched":
      return sentence("oldNameUnmatched", {}, { tag: tag(fact.tag) });
    case "irreversible":
      return sentence("irreversible", {}, {}, "destructive");
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

/** English plain text for non-React consumers. */
export function tagImpactMessageText(fact: TagImpactFact): string {
  return formatTagImpactFact(fact)
    .segments.map((segment) =>
      segment.kind === "tag" ? segment.tag.name : segment.text,
    )
    .join("");
}
