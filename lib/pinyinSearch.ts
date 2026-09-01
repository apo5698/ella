import { pinyin } from "pinyin-pro";

const SEARCH_FORMS_CACHE_LIMIT = 10_000;
const searchFormsCache = new Map<string, string[]>();

export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

/** Original text, full pinyin, and pinyin initials, all ready for matching. */
export function pinyinSearchForms(value: string): string[] {
  const cached = searchFormsCache.get(value);
  if (cached) return cached;
  const full = pinyin(value, { toneType: "none", type: "array" }) as string[];
  const initials = pinyin(value, {
    pattern: "first",
    toneType: "none",
    type: "array",
  }) as string[];
  const forms = [
    normalizeSearchText(value),
    normalizeSearchText(full.join("")),
    normalizeSearchText(initials.join("")),
  ];
  if (searchFormsCache.size >= SEARCH_FORMS_CACHE_LIMIT)
    searchFormsCache.clear();
  searchFormsCache.set(value, forms);
  return forms;
}

export function matchesPinyinSearch(
  value: string,
  normalizedQuery: string,
): boolean {
  return pinyinSearchForms(value).some((form) =>
    form.includes(normalizedQuery),
  );
}
