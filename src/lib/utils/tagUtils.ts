/**
 * Utility functions for tag manipulation.
 *
 * Tag rules used across the app:
 * - Names are trimmed and internal whitespace is collapsed.
 * - Names are compared case-insensitively ("CHF" and "chf" are the same tag),
 *   but the user's spelling is preserved.
 */

export const MAX_TAG_LENGTH = 50;

/**
 * Trims a tag name and collapses internal whitespace.
 */
export function normalizeTagName(name: string): string {
  return (name || '').replace(/\s+/g, ' ').trim();
}

/**
 * Case-insensitive key used to compare tag names.
 */
export function tagKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/**
 * Returns true if two tag names refer to the same tag.
 */
export function tagsEqual(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

/**
 * Returns true if `tags` contains `tag` (case-insensitive).
 */
export function hasTag(tags: string[] | undefined, tag: string): boolean {
  const key = tagKey(tag);
  return (tags || []).some(t => tagKey(t) === key);
}

/**
 * Validates a tag name. Returns an error message, or null if valid.
 */
export function validateTagName(name: string): string | null {
  const normalized = normalizeTagName(name);
  if (!normalized) return 'Tag name is required';
  if (normalized.length > MAX_TAG_LENGTH) {
    return `Tag name must be ${MAX_TAG_LENGTH} characters or fewer`;
  }
  return null;
}

/**
 * Returns the spelling of `name` from `known` if a case-insensitive match
 * exists, otherwise the normalized name.
 *
 * @example
 * canonicalTagName('chf', ['CHF', 'Cardiology']) // 'CHF'
 */
export function canonicalTagName(name: string, known: string[]): string {
  const key = tagKey(name);
  return known.find(k => tagKey(k) === key) ?? normalizeTagName(name);
}

/**
 * Normalizes and removes case-insensitive duplicates, keeping the first spelling
 * and the original order. Empty names are dropped.
 */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags || []) {
    const normalized = normalizeTagName(tag);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/**
 * Merges two tag arrays, removing case-insensitive duplicates and sorting
 * alphabetically (ignoring case). The first spelling seen is kept.
 *
 * @example
 * mergeTags(['Cardiology', 'CHF'], ['chf', 'Heart'])
 * // Returns: ['Cardiology', 'CHF', 'Heart']
 */
export function mergeTags(tags1: string[], tags2: string[]): string[] {
  return dedupeTags([...(tags1 || []), ...(tags2 || [])]).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

/**
 * Merges note tags with flashcard custom tags
 * Preserves user custom tags and adds note tags
 * @param flashcardTags - Tags already on the flashcard (user-added)
 * @param noteTags - Tags from the parent note
 * @returns Merged array of tags
 *
 * @example
 * mergeFlashcardTags(['important'], ['cardiology', 'emergency'])
 * // Returns: ['cardiology', 'emergency', 'important']
 */
export function mergeFlashcardTags(
  flashcardTags: string[] | undefined,
  noteTags: string[] | undefined
): string[] {
  return mergeTags(flashcardTags || [], noteTags || []);
}
