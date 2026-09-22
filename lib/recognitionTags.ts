/** Parses a bounded list of tags returned by the recognition model. */
export function parseRecognitionTags(text: string): string[] {
  return text
    .split(/[,，、\n]/)
    .map((s) =>
      s
        .trim()
        .replace(/^[#\-\d.\s]+/, "")
        .toLowerCase(),
    )
    .filter((s) => s.length >= 1 && s.length <= 64)
    .slice(0, 12);
}
