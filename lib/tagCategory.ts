import type { TagReviewState, TagTreeNode } from "./types";

/**
 * The groups a tag falls into, in the order they are read in: the user's own
 * tags first, generated ones after, and the two that carry no live association
 * last. Sorting and the display filters both take their order from here.
 */
export const TAG_CATEGORIES = [
  "excluded",
  "automatic",
  "approved",
  "category",
] as const;

export type TagCategory = TagReviewState;

/**
 * Which group a tag reads as. This mirrors the dot on its row, where a
 * rejection outranks the sources beside it: one tag, one dot, one group.
 *
 * A tag is the user's own or the model's, never both: accepting one makes it
 * manual everywhere, and a generated association takes the source the tag
 * already has. Manual still wins here, so a row left over from an older
 * database reads as the user's rather than as neither.
 */
export function tagCategory(
  node: Pick<TagTreeNode, "reviewState">,
): TagCategory {
  return node.reviewState;
}

export function isTagCategory(value: unknown): value is TagCategory {
  return TAG_CATEGORIES.includes(value as TagCategory);
}

/** Reads the display filter from a URL parameter, defaulting to every group. */
export function parseTagCategories(
  value: string | undefined,
): Set<TagCategory> {
  const legacy: Record<string, TagCategory> = {
    rejected: "excluded",
    vision: "automatic",
    manual: "approved",
    none: "approved",
  };
  const wanted = (value ?? "")
    .split(",")
    .map((item) => legacy[item] ?? item)
    .filter(isTagCategory);
  return wanted.length > 0 ? new Set(wanted) : new Set(TAG_CATEGORIES);
}

/**
 * What an exclusion control on a tag would do next, or null when the tag has
 * no video associations at all and neither operation has anything to act on.
 *
 * A tag that still has active associations is excluded; once only rejections
 * are left, the same control restores them. One tag can hold both at once, so
 * this names the operation available rather than claiming a binary state.
 */
export function tagExclusionAction(
  node: Pick<TagTreeNode, "reviewState">,
): "exclude" | "restore" {
  return node.reviewState === "excluded" ? "restore" : "exclude";
}
