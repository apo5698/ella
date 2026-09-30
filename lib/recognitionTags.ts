import { normalizeName } from "./names";

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 64;

/** Parses a bounded list of tags returned by the recognition model. */
export function parseRecognitionTags(text: string): string[] {
  const body = text
    // Reasoning models may emit their deliberation before the answer.
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
    // A leading label such as `Tags:` or `标签：` is not a tag.
    .replace(/^\s*(tags?|标签)\s*[:：]/i, "");

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of body.split(/[,，、;；\n]/)) {
    const tag = part
      .trim()
      // List markers only, so tags that begin with a digit such as `3d` stay whole.
      .replace(/^(?:[#*•\-]+|\d+[.)、])\s*/, "")
      .replace(/^["'`“”‘’「」]+|["'`“”‘’「」。.!！]+$/g, "")
      .trim()
      .toLowerCase();
    if (tag.length < 1 || tag.length > MAX_TAG_LENGTH) continue;
    const key = normalizeName(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}
