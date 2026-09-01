// How close two video names are. A download is warned about before it starts,
// so the comparison has to work on the name alone, against titles typed by
// hand at different times and from different sources.
import { pinyin } from "pinyin-pro";

const BRACKETED = /[[({【（]([^\])}】）]*)[\])}】）]/g;

/**
 * What a bracketed note has to say to survive. Brackets in this library
 * mostly carry the group a file came from, which is not part of the name, but
 * a number or a part marker inside them is the only thing telling one part of
 * a video from the next.
 */
const PART_NOTE = /^[\d\s.]+$|^[上中下前后]篇?$/;

/**
 * A name reduced to what a rename tends to leave alone: no extension, no
 * source note, and separators read as spaces. Two names differing only in
 * that noise normalize onto the same string.
 */
export function normalizeVideoName(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(BRACKETED, (_match, inner: string) =>
      PART_NOTE.test(inner.trim()) ? ` ${inner.trim()} ` : " ",
    )
    .replace(/[._\-+~]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Latin runs compare as whole words, everything else as character bigrams:
 * a word is the smallest piece of a latin name that carries meaning, while
 * Chinese has no spaces to cut on and two adjacent characters usually do.
 */
function grams(normalized: string): Set<string> {
  const set = new Set<string>();
  for (const token of normalized.split(" ")) {
    if (!token) continue;
    if (/^[a-z0-9]+$/.test(token) || token.length === 1) {
      set.add(token);
      continue;
    }
    for (let index = 0; index + 1 < token.length; index += 1) {
      set.add(token.slice(index, index + 2));
    }
  }
  return set;
}

/** Dice coefficient: shared grams against the size of both sets. */
function dice(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) {
    if (right.has(gram)) shared += 1;
  }
  return (2 * shared) / (left.size + right.size);
}

// Conversion is the expensive part of a comparison and every candidate title
// is converted again on the next request, so the result is kept. The cap is
// there because queries are cached alongside titles and are unbounded.
const PINYIN_CACHE_LIMIT = 4000;
const pinyinCache = new Map<string, string>();

/**
 * The reading, with nothing between the syllables. Where a syllable ends is
 * exactly what the two spellings disagree about: `ceshi shipin` groups by
 * word, the characters it stands for group one syllable at a time, and only
 * the run of letters is common to both.
 */
function pinyinForm(normalized: string): string {
  const cached = pinyinCache.get(normalized);
  if (cached !== undefined) return cached;
  const syllables = pinyin(normalized, {
    toneType: "none",
    type: "array",
  }) as string[];
  const form = syllables.join("").toLowerCase().replace(/\s+/g, "");
  if (pinyinCache.size >= PINYIN_CACHE_LIMIT) pinyinCache.clear();
  pinyinCache.set(normalized, form);
  return form;
}

/** Letter bigrams, since the reading has no word boundaries left to cut on. */
function pinyinGrams(normalized: string): Set<string> {
  const form = pinyinForm(normalized);
  const set = new Set<string>();
  for (let index = 0; index + 1 < form.length; index += 1) {
    set.add(form.slice(index, index + 2));
  }
  return set;
}

/**
 * Readings this close are the same name spelled two ways. Below it they are
 * two names that happen to share syllables, which letter bigrams over a
 * boundaryless string produce far too easily to treat as a match.
 */
const PINYIN_MATCH_MIN = 0.8;

/**
 * 0 for unrelated names, 1 for names that differ only in noise. The pinyin
 * reading is scored as well, so a title written in Chinese still matches the
 * same title spelled out in letters.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeVideoName(a);
  const right = normalizeVideoName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const direct = dice(grams(left), grams(right));
  const reading = dice(pinyinGrams(left), pinyinGrams(right));
  return Math.max(direct, reading >= PINYIN_MATCH_MIN ? reading : 0);
}

/**
 * Above this two names are the same name. Set from the library: with the two
 * exemptions below applied, 20 of its 393k title pairs reach it, and those are
 * videos it already holds twice.
 */
const DUPLICATE_NAME_THRESHOLD = 0.9;

/** Shorter than this a name carries nothing to compare. */
const MIN_COMPARABLE_LENGTH = 4;

/**
 * Whether the two names are the same video described twice, which is what a
 * truncated or slightly reworded name produces. Two exemptions keep it off
 * cases the score cannot tell apart on its own: names that agree except in
 * their numbers are parts of a set rather than copies, and a name too short to
 * carry anything is left to the exact check.
 */
export function isSameVideoName(a: string, b: string): boolean {
  const left = normalizeVideoName(a);
  const right = normalizeVideoName(b);
  if (
    left.length < MIN_COMPARABLE_LENGTH ||
    right.length < MIN_COMPARABLE_LENGTH
  ) {
    return false;
  }
  const withoutDigits = (value: string) => value.replace(/\d+/g, "");
  if (left !== right && withoutDigits(left) === withoutDigits(right)) {
    return false;
  }
  return nameSimilarity(a, b) >= DUPLICATE_NAME_THRESHOLD;
}
