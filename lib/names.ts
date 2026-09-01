/**
 * The one spelling rule for a tag or series name. Both are typed by hand, both
 * are matched against what a model or a filename produced, and a name that
 * differs only by case or spacing is the same name: keeping two of them would
 * split one idea's videos across two entries that never meet.
 *
 * No database import, so the browser can hold a field to the same rule the
 * server will apply to what it sends.
 */
export function normalizeName(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      // A separator at either end came from a space at either end, which the
      // rule removes rather than converts.
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * The same rule applied to a field as it is typed. Trimming is left out on
 * purpose: a space typed mid-name is the separator, and trimming it away as it
 * arrives would silently join the two words instead.
 */
export function normalizeNameInput(raw: string): string {
  return raw.replace(/^\s+/, "").toLowerCase().replace(/\s+/g, "-");
}
