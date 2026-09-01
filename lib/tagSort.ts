import { TAG_CATEGORIES, tagCategory } from "./tagCategory";
import { compareNames } from "./tagOrder";
import type { TagTreeNode } from "./types";

/**
 * The orders the tag management page offers. Sorting is applied to each level
 * of the tree on its own, so a parent keeps its children no matter which order
 * is chosen.
 */
export const TAG_SORT_OPTIONS = [
  { value: "name_asc", label: "名称 A-Z" },
  { value: "name_desc", label: "名称 Z-A" },
  { value: "count_desc", label: "视频最多" },
  { value: "count_asc", label: "视频最少" },
  { value: "category", label: "类别" },
] as const;

export type TagSort = (typeof TAG_SORT_OPTIONS)[number]["value"];

/**
 * Biggest families first: the tags worth curating are the ones that reach a
 * meaningful number of videos, and an alphabetical list opens on whatever
 * happens to sort first.
 */
export const DEFAULT_TAG_SORT: TagSort = "count_desc";

export const TAG_SORT_LABELS: Record<TagSort, string> = Object.fromEntries(
  TAG_SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<TagSort, string>;

export function isTagSort(value: unknown): value is TagSort {
  return TAG_SORT_OPTIONS.some((option) => option.value === value);
}

/** The groups the row dots draw, ordered as the display filters list them. */
function categoryRank(node: TagTreeNode): number {
  return TAG_CATEGORIES.indexOf(tagCategory(node));
}

// The subtree total rather than the tag's own count, which is the larger of
// the two numbers a row shows and what selecting the tag actually returns.
const COMPARATORS: Record<TagSort, (a: TagTreeNode, b: TagTreeNode) => number> =
  {
    name_asc: (a, b) => compareNames(a.name, b.name),
    name_desc: (a, b) => compareNames(b.name, a.name),
    count_desc: (a, b) =>
      b.totalCount - a.totalCount || compareNames(a.name, b.name),
    count_asc: (a, b) =>
      a.totalCount - b.totalCount || compareNames(a.name, b.name),
    category: (a, b) =>
      categoryRank(a) - categoryRank(b) || compareNames(a.name, b.name),
  };

export function sortTagTree(
  nodes: TagTreeNode[],
  sort: TagSort,
): TagTreeNode[] {
  const compare = COMPARATORS[sort];
  return nodes
    .map((node) => ({ ...node, children: sortTagTree(node.children, sort) }))
    .sort(compare);
}
