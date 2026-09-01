// One ordering for content tags, used by the server that renders them and by
// the client that edits them. When the two disagree the list visibly rearranges
// itself on the next reload.
//
// The series is not part of this: it is rendered separately and always leads.

/**
 * Pinyin rather than code points. SQLite orders Chinese text by code point,
 * which puts 人 before 床 and reads as unsorted. `numeric` covers the digits a
 * hand-typed tag may contain, so 第2集 precedes 第10集. Resolution and duration
 * are not tags: see lib/tagger.ts.
 */
const collator = new Intl.Collator("zh-Hans-u-co-pinyin", { numeric: true });

export const compareNames = (a: string, b: string) => collator.compare(a, b);

/**
 * `path` is the tag's ancestors, root first, ending in the tag itself. A tag
 * with no parent has a path of just its own name, which is what an absent
 * `path` is read as.
 */
export type OrderableTag = { name: string; source: string; path?: string[] };

function pathOf(tag: OrderableTag): string[] {
  return tag.path && tag.path.length > 0 ? tag.path : [tag.name];
}

/**
 * Depth-first order within one family: a parent leads its own children, and
 * siblings read in pinyin order. Comparing the paths element by element
 * produces that without having to build the tree.
 */
function comparePaths(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const step = collator.compare(a[i], b[i]);
    if (step !== 0) return step;
  }
  return a.length - b.length;
}

/**
 * Families stay together, so a parent and its children read as one block
 * rather than scattered through the alphabet.
 *
 * Between families, one containing a tag the user added leads, which keeps the
 * earlier rule that vouched-for tags read first. Inside a family the source is
 * not consulted: splitting it would undo the grouping. Which tags are the
 * user's own is still legible, from their colour.
 */
export function sortTags<T extends OrderableTag>(tags: T[]): T[] {
  const families = new Map<string, T[]>();
  for (const tag of tags) {
    const root = pathOf(tag)[0];
    const family = families.get(root);
    if (family) family.push(tag);
    else families.set(root, [tag]);
  }

  const ordered = [...families.entries()].sort(([rootA, a], [rootB, b]) => {
    const rank = (family: T[]) =>
      family.some((t) => t.source === "manual") ? 0 : 1;
    return rank(a) - rank(b) || collator.compare(rootA, rootB);
  });

  return ordered.flatMap(([, family]) =>
    [...family].sort((a, b) => comparePaths(pathOf(a), pathOf(b))),
  );
}

/**
 * The same ordering, kept as families rather than flattened, for a list that
 * wants to draw each family as its own block.
 */
export function groupTags<T extends OrderableTag>(tags: T[]): T[][] {
  const groups: T[][] = [];
  for (const tag of sortTags(tags)) {
    const root = pathOf(tag)[0];
    const last = groups[groups.length - 1];
    if (last && pathOf(last[0])[0] === root) last.push(tag);
    else groups.push([tag]);
  }
  return groups;
}

/** Rejected tags carry no source, so they order on the name alone. */
export function sortNames(names: string[]): string[] {
  return [...names].sort(collator.compare);
}
