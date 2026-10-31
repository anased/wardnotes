// src/lib/utils/relatedNotes.ts
import type { Note } from '@/lib/supabase/client';
import { tagKey } from './tagUtils';

export const DEFAULT_RELATED_LIMIT = 5;

/** Weight of each shared tag. A shared tag counts for more than a shared category. */
const SHARED_TAG_WEIGHT = 2;
const SAME_CATEGORY_WEIGHT = 1;

export interface RelatedNote {
  note: Note;
  /** Tags the candidate shares with the source note, in the candidate's spelling. */
  sharedTags: string[];
  sameCategory: boolean;
  score: number;
}

type RelatableNote = Pick<Note, 'id' | 'tags' | 'category'>;

/**
 * Ranks `candidates` by how related they are to `source`: shared tags first,
 * then same category, then most recent. Excludes the source note itself and
 * any candidate with nothing in common. Tag and category matching ignore case.
 */
export function rankRelatedNotes(
  source: RelatableNote,
  candidates: Note[],
  limit: number = DEFAULT_RELATED_LIMIT
): RelatedNote[] {
  const sourceTagKeys = new Set((source.tags || []).map(tagKey));
  const sourceCategory = (source.category || '').trim().toLowerCase();
  const seen = new Set<string>([source.id]);
  const ranked: RelatedNote[] = [];

  for (const note of candidates) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);

    const sharedTags = (note.tags || []).filter(tag => sourceTagKeys.has(tagKey(tag)));
    const sameCategory =
      sourceCategory !== '' && (note.category || '').trim().toLowerCase() === sourceCategory;
    const score =
      sharedTags.length * SHARED_TAG_WEIGHT + (sameCategory ? SAME_CATEGORY_WEIGHT : 0);

    if (score > 0) {
      ranked.push({ note, sharedTags, sameCategory, score });
    }
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.note.created_at).getTime() - new Date(a.note.created_at).getTime()
  );

  return ranked.slice(0, Math.max(0, limit));
}
