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

const text = (
  value: string,
  tone: TagImpactMessage["tone"] = "default",
): TagImpactMessage => ({ tone, segments: [{ kind: "text", text: value }] });

const tag = (value: ImpactedTag): TagImpactMessageSegment => ({
  kind: "tag",
  tag: value,
});

const videos = (
  count: number,
  videoIds: number[] = [],
): TagImpactMessageSegment => ({
  kind: "video-count",
  text: `${count} 个视频`,
  videoIds,
});

/**
 * The single source of truth for every sentence in tag impact analysis.
 *
 * The API returns facts only. Keeping the language here lets the UI add rich
 * treatment such as the child-tag HoverCard without making the database layer
 * responsible for presentation copy.
 */
export function formatTagImpactFact(fact: TagImpactFact): TagImpactMessage {
  switch (fact.kind) {
    case "videos-lose-tags":
      return fact.count === 0
        ? {
            tone: "default",
            segments: [
              videos(0),
              {
                kind: "text",
                text: `使用${fact.multipleTags ? "这些标签" : "该标签"}。`,
              },
            ],
          }
        : {
            tone: "destructive",
            segments: [
              videos(fact.count, fact.videoIds),
              {
                kind: "text",
                text: `将失去${fact.multipleTags ? "这些标签" : "该标签"}。`,
              },
            ],
          };
    case "classification-conflict":
      return {
        tone: fact.count > 0 ? "destructive" : "default",
        segments: [
          videos(fact.count, fact.videoIds),
          {
            kind: "text",
            text:
              fact.count > 0
                ? "仍直接使用该标签，请先移除或改用子标签"
                : "直接使用该标签",
          },
        ],
      };
    case "children-moved":
      return {
        tone: "default",
        segments: [
          {
            kind: "children",
            text: `${fact.items.length} 个子标签`,
            items: fact.items,
          },
          {
            kind: "text",
            text:
              fact.destination.kind === "up"
                ? "将移至上一层，不会被删除。"
                : "将移至",
          },
          ...(fact.destination.kind === "tag"
            ? [
                tag(fact.destination.tag),
                { kind: "text" as const, text: "下。" },
              ]
            : []),
        ],
      };
    case "children-unaffected":
      return {
        tone: "default",
        segments: [
          {
            kind: "children",
            text: `${fact.items.length} 个子标签`,
            items: fact.items,
          },
          {
            kind: "text",
            text: "及其视频不受影响，层级关系保持不变。",
          },
        ],
      };
    case "rejections-deleted":
      return text(
        `${fact.count} 条排除记录将一并删除，重新识别时该标签可能再次出现。`,
      );
    case "manual-links-excluded":
      return text(
        `其中 ${fact.count} 条为已审核标签，排除后同样不再显示。`,
        "destructive",
      );
    case "regeneration-blocked":
      return text(
        `重新识别时不会再为这些视频添加${fact.multipleTags ? "这些标签" : "该标签"}。`,
      );
    case "restorable":
      return text('可通过"取消排除"恢复。');
    case "rejections-restored":
      return fact.count === 0
        ? text(`${fact.multipleTags ? "这些标签" : "该标签"}没有排除记录。`)
        : {
            tone: "default",
            segments: [
              videos(fact.videoCount, fact.videoIds),
              {
                kind: "text",
                text:
                  fact.count === fact.videoCount
                    ? "上的排除记录将恢复为有效标签。"
                    : `上的 ${fact.count} 条排除记录将恢复为有效标签。`,
              },
            ],
          };
    case "restore-covers-earlier":
      return text("在视频页排除的记录也会一并恢复。");
    case "automatic-links-approved":
      return {
        tone: "default",
        segments: [
          videos(fact.count, fact.videoIds),
          { kind: "text", text: "上的自动标签将转为已审核标签。" },
        ],
      };
    case "tag-made-assignable":
      return {
        tone: "default",
        segments: [
          videos(0),
          { kind: "text", text: "受影响，该标签将可直接添加到视频。" },
        ],
      };
    case "aliases-invalidated":
      return text(`${fact.count} 个别名将失效，按别名搜索不再匹配。`);
    case "video-tags-unchanged":
      return text("视频的标签不变。");
    case "filter-gain":
      return {
        tone: "default",
        segments: [
          { kind: "text", text: "筛选" },
          tag(fact.parent),
          ...(fact.count === 0
            ? [{ kind: "text" as const, text: "返回的视频不变。" }]
            : [
                { kind: "text" as const, text: "将额外返回 " },
                videos(fact.count, fact.videoIds),
                { kind: "text" as const, text: "。" },
              ]),
        ],
      };
    case "tag-created":
      return {
        tone: "default",
        segments: [{ kind: "text", text: "将新建" }, tag(fact.tag)],
      };
    case "filter-loss":
      return {
        tone: "default",
        segments: [
          { kind: "text", text: "筛选" },
          tag(fact.parent),
          { kind: "text", text: "将不再返回 " },
          videos(fact.count, fact.videoIds),
          { kind: "text", text: "。" },
        ],
      };
    case "already-top-level":
      return text("这些标签已位于顶级。");
    case "videos-retagged":
      return fact.count === 0
        ? {
            tone: "default",
            segments: [
              videos(0),
              {
                kind: "text",
                text: `使用${fact.multipleTags ? "这些标签" : "该标签"}。`,
              },
            ],
          }
        : {
            tone: "default",
            segments: [
              videos(fact.count, fact.videoIds),
              { kind: "text", text: "将改用" },
              tag(fact.target),
            ],
          };
    case "merge-overlap":
      return {
        tone: "default",
        segments: [
          { kind: "text", text: "其中 " },
          videos(fact.count, fact.videoIds),
          { kind: "text", text: "已同时拥有" },
          tag(fact.target),
          { kind: "text", text: "，合并后标签数减少。" },
        ],
      };
    case "names-become-aliases":
      return {
        tone: "default",
        segments: [
          { kind: "text", text: `${fact.count} 个名称将成为` },
          tag(fact.target),
          { kind: "text", text: "的别名，原标签不再存在。" },
        ],
      };
    case "video-tag-renamed":
      return fact.count === 0
        ? {
            tone: "default",
            segments: [videos(0), { kind: "text", text: "使用该标签。" }],
          }
        : {
            tone: "default",
            segments: [
              videos(fact.count, fact.videoIds),
              { kind: "text", text: "上的标签名将变更为" },
              tag(fact.tag),
            ],
          };
    case "old-name-unmatched":
      return {
        tone: "default",
        segments: [
          { kind: "text", text: "搜索" },
          tag(fact.tag),
          {
            kind: "text",
            text: "将不再匹配该标签。如需保留，可将其添加为别名。",
          },
        ],
      };
    case "irreversible":
      return text("此操作不可撤销。", "destructive");
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

/** Plain text for non-React consumers such as the hierarchy integrity check. */
export function tagImpactMessageText(fact: TagImpactFact): string {
  return formatTagImpactFact(fact)
    .segments.map((segment) =>
      segment.kind === "tag" ? segment.tag.name : segment.text,
    )
    .join("");
}
