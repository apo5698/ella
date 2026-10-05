/**
 * The spelling rule for a tag name: lowercase, with spaces closed up into
 * hyphens. A tag is matched against what a model or a filename produced, and a
 * name that differs only by case or spacing is the same name: keeping two of
 * them would split one idea's videos across two entries that never meet. A
 * series follows its own rule below.
 *
 * No database import, so the browser can hold a field to the same rule the
 * server will apply to what it sends.
 */
export function normalizeName(raw: string): string {
  return closeUpSpaces(raw).toLowerCase();
}

function closeUpSpaces(raw: string): string {
  return (
    raw
      .trim()
      .replace(/\s+/g, "-")
      // A separator at either end came from a space at either end, which the
      // rule removes rather than converts.
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * A series name as written: case and single spaces kept, so it can read as
 * `Cocoa Soft` rather than `cocoa-soft`. It is still matched without regard to
 * case, so two spellings that differ only by case remain one series.
 */
export function normalizeSeriesLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The same rule applied to a field as it is typed. Trimming is left out on
 * purpose: a space typed mid-name is the separator, and trimming it away as it
 * arrives would silently join the two words instead.
 */
export function normalizeNameInput(raw: string, series = false): string {
  const trimmed = raw.replace(/^\s+/, "");
  return series
    ? trimmed.replace(/\s+/g, " ")
    : trimmed.replace(/\s+/g, "-").toLowerCase();
}
