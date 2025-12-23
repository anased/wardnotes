/**
 * Utility functions for tag manipulation
 */

/**
 * Merges two tag arrays, removing duplicates (case-insensitive) and sorting alphabetically
 * @param tags1 - First array of tags
 * @param tags2 - Second array of tags
 * @returns Merged and deduplicated array of tags, sorted alphabetically
 *
 * @example
 * mergeTags(['Cardiology', 'CHF'], ['chf', 'Heart'])
 * // Returns: ['cardiology', 'chf', 'heart']
 */
export function mergeTags(tags1: string[], tags2: string[]): string[] {
  const combined = [...(tags1 || []), ...(tags2 || [])];
  const unique = Array.from(new Set(combined.map(tag => tag.toLowerCase())));
  return unique.sort();
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
