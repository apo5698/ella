import type { TagCategory } from "@/lib/tagCategory";

/** Shared presentation rules for content tags and series across every page. */
export const SOURCE_STYLE: Record<string, string> = {
  manual: "bg-tag-manual text-tag-manual-foreground",
  vision: "bg-tag-vision text-tag-vision-foreground",
};

export const GLOBAL_STYLE = "rounded-sm";
export const INLINE_STYLE = "align-baseline mx-1 px-1.5 h-4";
export const ALIAS_STYLE = "border-dashed text-muted-foreground";
export const SERIES_STYLE = "bg-series text-series-foreground";
export const CATEGORY_STYLE = "bg-tag-category text-tag-category-foreground";

export const TAG_STATE_STYLE: Record<TagCategory, string> = {
  excluded: "bg-destructive/10 text-destructive",
  automatic: SOURCE_STYLE.vision,
  approved: SOURCE_STYLE.manual,
  category: CATEGORY_STYLE,
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: "已审核",
  vision: "自动",
};

export const TAG_STATE_LABEL: Record<TagCategory, string> = {
  excluded: "排除",
  automatic: "自动",
  approved: "已审核",
  category: "分类",
};

export const TAG_STATE_DOT_STYLE: Record<TagCategory, string> = {
  excluded: "bg-destructive",
  automatic: "bg-tag-vision-border",
  approved: "bg-tag-manual-border",
  category: "bg-tag-category-border",
};

/** A tag is the user's own or the model's; an exclusion outranks both. */
export function sourceDotStyle(
  sources: string[],
  rejected = false,
  assignable = true,
) {
  if (!assignable) return "bg-tag-category-border";
  if (rejected) return "bg-destructive";
  if (sources.includes("manual")) return "bg-tag-manual-border";
  if (sources.includes("vision")) return "bg-tag-vision-border";
  return "bg-muted-foreground/30";
}

export const TAG_DOT_LEGEND = [
  {
    id: "excluded",
    label: TAG_STATE_LABEL.excluded,
    className: TAG_STATE_DOT_STYLE.excluded,
  },
  {
    id: "automatic",
    label: TAG_STATE_LABEL.automatic,
    className: TAG_STATE_DOT_STYLE.automatic,
  },
  {
    id: "approved",
    label: TAG_STATE_LABEL.approved,
    className: TAG_STATE_DOT_STYLE.approved,
  },
  {
    id: "category",
    label: TAG_STATE_LABEL.category,
    className: TAG_STATE_DOT_STYLE.category,
  },
] as const satisfies readonly {
  id: TagCategory;
  label: string;
  className: string;
}[];
