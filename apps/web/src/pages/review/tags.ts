const TAG_LIMIT = 20;
const TAG_LENGTH = 40;

/** Comma-separated tag field → the tags the review API will store. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(',')) {
    const tag = part.trim();
    if (tag.length === 0 || tag.length > TAG_LENGTH || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === TAG_LIMIT) break;
  }
  return tags;
}

export function formatTags(tags: readonly string[]): string {
  return tags.join(', ');
}
