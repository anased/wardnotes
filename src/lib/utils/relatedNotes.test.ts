import type { Note } from '@/lib/supabase/client';
import { buildTopicGraph } from './topicTree';
import { describeRelatedNote, rankRelatedNotes, relatedTopicIds, topicRelation } from './relatedNotes';

const t = (id: string, name: string) => ({ id, name, aliases: [] as string[] });
// Neurology > Cerebrovascular > {PRES, Small vessel disease > BAD}
// Neurology > Neurocritical care > {PRES, Status epilepticus}
const graph = buildTopicGraph(
  [
    t('neuro', 'Neurology'),
    t('cv', 'Cerebrovascular'),
    t('ncc', 'Neurocritical care'),
    t('pres', 'PRES'),
    t('svd', 'Small vessel disease'),
    t('bad', 'BAD'),
    t('se', 'Status epilepticus'),
    t('epi', 'Epilepsy'),
    t('cards', 'Cardiology'),
  ],
  [
    { parent_id: 'neuro', child_id: 'cv' },
    { parent_id: 'neuro', child_id: 'ncc' },
    { parent_id: 'neuro', child_id: 'epi' },
    { parent_id: 'cv', child_id: 'pres' },
    { parent_id: 'ncc', child_id: 'pres' },
    { parent_id: 'cv', child_id: 'svd' },
    { parent_id: 'svd', child_id: 'bad' },
    { parent_id: 'ncc', child_id: 'se' },
  ]
);

const links = (...ids: string[]) => ids.map((topic_id, i) => ({ topic_id, is_primary: i === 0 }));

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    user_id: 'user-1',
    title: `Note ${id}`,
    content: {},
    tags: [],
    category: null,
    status: 'answered',
    content_type: null,
    created_at: '2026-01-01T00:00:00Z',
    note_topics: [],
    ...overrides,
  };
}

describe('topicRelation', () => {
  test('siblings share a parent', () => {
    expect(topicRelation(graph, 'pres', 'svd')).toEqual({ kind: 'sibling', topicId: 'cv', weight: 3 });
    expect(topicRelation(graph, 'pres', 'se')).toEqual({ kind: 'sibling', topicId: 'ncc', weight: 3 });
  });

  test('broader and narrower topics, nearer is stronger', () => {
    expect(topicRelation(graph, 'pres', 'cv')).toMatchObject({ kind: 'broader', topicId: 'cv', weight: 3 });
    expect(topicRelation(graph, 'bad', 'cv')).toMatchObject({ kind: 'broader', weight: 2 });
    expect(topicRelation(graph, 'cv', 'bad')).toMatchObject({ kind: 'narrower', topicId: 'bad', weight: 2 });
  });

  test('cousins share an area', () => {
    expect(topicRelation(graph, 'bad', 'pres')).toEqual({ kind: 'area', topicId: 'cv', weight: 2 });
  });

  test('a shared specialty alone is not a relation', () => {
    expect(topicRelation(graph, 'cv', 'epi')).toBeNull();
    expect(topicRelation(graph, 'pres', 'neuro')).toBeNull();
    expect(topicRelation(graph, 'neuro', 'pres')).toBeNull();
    expect(topicRelation(graph, 'pres', 'cards')).toBeNull();
  });
});

describe('relatedTopicIds', () => {
  test('covers the subtrees of the topic’s domains, not the whole specialty', () => {
    expect(relatedTopicIds(graph, ['bad']).sort()).toEqual(['bad', 'cv', 'pres', 'svd']);
    expect(relatedTopicIds(graph, ['pres']).sort()).toEqual(['bad', 'cv', 'ncc', 'pres', 'se', 'svd']);
  });

  test('a specialty only matches itself; unknown ids are skipped', () => {
    expect(relatedTopicIds(graph, ['neuro', 'missing'])).toEqual(['neuro']);
  });
});

describe('rankRelatedNotes', () => {
  const source = makeNote('source', { tags: ['RITE', 'Clinical pearls'], note_topics: links('pres') });

  test('excludes the source note and unrelated notes', () => {
    const result = rankRelatedNotes(
      source,
      [source, makeNote('unrelated', { tags: ['COPD'], note_topics: links('cards') })],
      graph
    );
    expect(result).toEqual([]);
  });

  test('same topic > same parent > broader area > labels', () => {
    const result = rankRelatedNotes(
      source,
      [
        makeNote('one-label', { tags: ['RITE'], note_topics: links('epi') }),
        makeNote('cousin', { note_topics: links('bad') }),
        makeNote('sibling', { note_topics: links('se') }),
        makeNote('same-topic', { note_topics: links('pres') }),
        makeNote('same-specialty-only', { note_topics: links('neuro') }),
      ],
      graph,
      10
    );
    expect(result.map((r) => r.note.id)).toEqual(['same-topic', 'sibling', 'cousin', 'one-label']);
  });

  test('describes the match', () => {
    const result = rankRelatedNotes(
      source,
      [
        makeNote('same-topic', { tags: ['rite'], note_topics: links('pres') }),
        makeNote('sibling', { note_topics: links('svd') }),
        makeNote('label', { tags: ['RITE'] }),
      ],
      graph
    );
    expect(result.map((r) => describeRelatedNote(r, graph))).toEqual([
      'shared topic PRES · 1 shared label',
      'same parent: Cerebrovascular',
      '1 shared label',
    ]);
    expect(result[0].sharedTags).toEqual(['rite']);
  });

  test('notes filed under the same specialty count for little', () => {
    const bySpecialty = makeNote('neuro-note', { note_topics: links('neuro') });
    const [match] = rankRelatedNotes(makeNote('s', { note_topics: links('neuro') }), [bySpecialty], graph);
    expect(match.score).toBe(1);
    expect(describeRelatedNote(match, graph)).toBe('shared topic Neurology');
  });

  test('breaks ties by most recent first', () => {
    const result = rankRelatedNotes(
      source,
      [
        makeNote('older', { note_topics: links('pres'), created_at: '2026-01-01T00:00:00Z' }),
        makeNote('newer', { note_topics: links('pres'), created_at: '2026-03-01T00:00:00Z' }),
      ],
      graph
    );
    expect(result.map((r) => r.note.id)).toEqual(['newer', 'older']);
  });

  test('respects the limit and drops duplicate candidates', () => {
    const dup = makeNote('a', { tags: ['RITE'] });
    const result = rankRelatedNotes(
      source,
      [dup, dup, makeNote('b', { tags: ['RITE'] }), makeNote('c', { tags: ['RITE'] })],
      graph,
      2
    );
    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.note.id)).size).toBe(2);
  });

  test('handles notes without tags or topics', () => {
    const bare = makeNote('bare', { tags: undefined as unknown as string[], note_topics: undefined });
    expect(rankRelatedNotes(bare, [makeNote('x')], graph)).toEqual([]);
  });
});
