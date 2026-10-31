import type { Note } from '@/lib/supabase/client';
import { rankRelatedNotes } from './relatedNotes';

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    user_id: 'user-1',
    title: `Note ${id}`,
    content: {},
    tags: [],
    category: 'General',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('rankRelatedNotes', () => {
  const source = makeNote('source', { tags: ['CHF', 'Diuretics'], category: 'Cardiology' });

  test('excludes the source note and unrelated notes', () => {
    const result = rankRelatedNotes(source, [
      source,
      makeNote('unrelated', { tags: ['COPD'], category: 'Pulmonology' }),
    ]);
    expect(result).toEqual([]);
  });

  test('ranks shared tags above a shared category', () => {
    const result = rankRelatedNotes(source, [
      makeNote('category-only', { category: 'Cardiology' }),
      makeNote('one-tag', { tags: ['CHF'], category: 'Nephrology' }),
      makeNote('two-tags', { tags: ['CHF', 'Diuretics'], category: 'Nephrology' }),
      makeNote('tag-and-category', { tags: ['Diuretics'], category: 'Cardiology' }),
    ]);
    expect(result.map(r => r.note.id)).toEqual([
      'two-tags',
      'tag-and-category',
      'one-tag',
      'category-only',
    ]);
  });

  test('matches tags and category case-insensitively and reports shared tags', () => {
    const [match] = rankRelatedNotes(source, [
      makeNote('match', { tags: [' chf ', 'Other'], category: 'cardiology' }),
    ]);
    expect(match.sharedTags).toEqual([' chf ']);
    expect(match.sameCategory).toBe(true);
    expect(match.score).toBe(3);
  });

  test('breaks ties by most recent first', () => {
    const result = rankRelatedNotes(source, [
      makeNote('older', { tags: ['CHF'], created_at: '2026-01-01T00:00:00Z' }),
      makeNote('newer', { tags: ['CHF'], created_at: '2026-03-01T00:00:00Z' }),
    ]);
    expect(result.map(r => r.note.id)).toEqual(['newer', 'older']);
  });

  test('respects the limit and drops duplicate candidates', () => {
    const dup = makeNote('a', { tags: ['CHF'] });
    const result = rankRelatedNotes(
      source,
      [dup, dup, makeNote('b', { tags: ['CHF'] }), makeNote('c', { tags: ['CHF'] })],
      2
    );
    expect(result).toHaveLength(2);
    expect(new Set(result.map(r => r.note.id)).size).toBe(2);
  });

  test('handles notes without tags or category', () => {
    const bare = makeNote('bare', { tags: undefined as unknown as string[], category: '' });
    expect(rankRelatedNotes(bare, [makeNote('x', { category: '' })])).toEqual([]);
  });
});
