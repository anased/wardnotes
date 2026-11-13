/**
 * Editing a note's topic links in the editor: several topics, exactly one
 * primary (whenever there is at least one), and an optional section per topic.
 */
import type { NoteTopicLinkInput } from '../supabase/types';

export type NoteTopicLink = NoteTopicLinkInput;

/** Makes sure exactly one link is primary (the first one marked, else the first link). */
export function ensurePrimary(links: NoteTopicLink[]): NoteTopicLink[] {
  if (links.length === 0) return links;
  const primaryIndex = Math.max(0, links.findIndex((l) => l.is_primary));
  return links.map((l, i) => (l.is_primary === (i === primaryIndex) ? l : { ...l, is_primary: i === primaryIndex }));
}

/**
 * Applies a new list of topic ids from the picker: keeps the section and
 * primary flag of topics that stay, adds new ones as Unsorted, and keeps
 * exactly one primary.
 */
export function withTopicIds(links: NoteTopicLink[], topicIds: string[]): NoteTopicLink[] {
  const byId = new Map(links.map((l) => [l.topic_id, l]));
  return ensurePrimary(
    topicIds.map((topic_id) => byId.get(topic_id) ?? { topic_id, section_id: null, is_primary: false })
  );
}

export function withPrimary(links: NoteTopicLink[], topicId: string): NoteTopicLink[] {
  return links.map((l) => ({ ...l, is_primary: l.topic_id === topicId }));
}

export function withSection(links: NoteTopicLink[], topicId: string, sectionId: string | null): NoteTopicLink[] {
  return links.map((l) => (l.topic_id === topicId ? { ...l, section_id: sectionId } : l));
}

/** Primary first, then the order the topics were added. */
export function sortForDisplay(links: NoteTopicLink[]): NoteTopicLink[] {
  return [...links].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

/** True when two link lists would save the same thing. */
export function sameLinks(a: NoteTopicLink[], b: NoteTopicLink[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: NoteTopicLink) => `${l.topic_id}|${l.section_id ?? ''}|${l.is_primary ? 1 : 0}`;
  const setB = new Set(b.map(key));
  return a.every((l) => setB.has(key(l)));
}

/** Reads links back from a stored draft, dropping anything malformed. */
export function parseDraftLinks(value: unknown): NoteTopicLink[] | null {
  if (!Array.isArray(value)) return null;
  const links = value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof v.topic_id === 'string')
    .map((v) => ({
      topic_id: v.topic_id as string,
      section_id: typeof v.section_id === 'string' ? v.section_id : null,
      is_primary: v.is_primary === true,
    }));
  return ensurePrimary(links);
}
