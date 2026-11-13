/** Pure helpers for laying out a topic page. */

export interface SectionLike {
  id: string;
  name: string;
  sort_order: number;
}

export interface SectionGroup<S extends SectionLike, L> {
  /** null for "Unsorted". */
  section: S | null;
  items: L[];
}

/**
 * Groups a topic's links by section, in section order, followed by Unsorted.
 * Only groups with items are returned, so a topic without sections shows its
 * notes under Unsorted with no empty headings. Links whose section no longer
 * exists count as Unsorted.
 */
export function groupBySection<S extends SectionLike, L extends { section_id: string | null }>(
  sections: S[],
  links: L[]
): SectionGroup<S, L>[] {
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const known = new Set(ordered.map((s) => s.id));
  const groups: SectionGroup<S, L>[] = ordered.map((section) => ({
    section,
    items: links.filter((l) => l.section_id === section.id),
  }));
  groups.push({ section: null, items: links.filter((l) => !l.section_id || !known.has(l.section_id)) });
  return groups.filter((g) => g.items.length > 0);
}

/** Moves the item at `index` one place up (-1) or down (+1); returns a new array. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Suggestions not yet used by the topic (case-insensitive). */
export function unusedSuggestions(suggestions: readonly string[], sections: { name: string }[]): string[] {
  const used = new Set(sections.map((s) => s.name.trim().toLowerCase()));
  return suggestions.filter((s) => !used.has(s.toLowerCase()));
}
