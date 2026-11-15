import { diffOutgoingLinks, groupLinks, isLinkRelation } from './noteLinks';
import type { LinkRelation } from '../supabase/types';

const link = (
  id: string,
  source: [string, string],
  target: [string, string],
  relation: LinkRelation
) => ({
  id,
  source_type: source[0] as 'note' | 'trial',
  source_id: source[1],
  target_type: target[0] as 'note' | 'trial',
  target_id: target[1],
  relation,
});

const self = { type: 'note' as const, id: 'q' };

describe('groupLinks', () => {
  test('reads links in both directions with matching labels', () => {
    const links = [
      link('1', ['note', 'a'], ['note', 'q'], 'answers'), // a answers q
      link('2', ['note', 'q'], ['trial', 'point'], 'cites'), // q cites POINT
      link('3', ['note', 'c'], ['note', 'q'], 'illustrates'),
    ];
    const groups = groupLinks(self, links);
    expect(groups.map((g) => [g.label, g.items.map((i) => `${i.direction}:${i.other.id}`)])).toEqual([
      ['Cites', ['outgoing:point']],
      ['Answered by', ['incoming:a']],
      ['Illustrated by', ['incoming:c']],
    ]);
  });

  test('"related" reads the same both ways and shares a group', () => {
    const groups = groupLinks(self, [
      link('1', ['note', 'q'], ['note', 'x'], 'related'),
      link('2', ['note', 'y'], ['note', 'q'], 'related'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Related to');
    expect(groups[0].items.map((i) => i.other.id)).toEqual(['x', 'y']);
  });

  test('a trial sees notes that cite it', () => {
    const groups = groupLinks({ type: 'trial', id: 'point' }, [link('2', ['note', 'q'], ['trial', 'point'], 'cites')]);
    expect(groups[0]).toMatchObject({ label: 'Cited by', items: [{ other: { type: 'note', id: 'q' } }] });
  });

  test('ignores links that do not touch it', () => {
    expect(groupLinks(self, [link('1', ['note', 'a'], ['note', 'b'], 'supports')])).toEqual([]);
  });
});

describe('diffOutgoingLinks', () => {
  test('creates new, removes dropped, keeps unchanged and ignores duplicates', () => {
    const current = [
      link('1', ['note', 'q'], ['trial', 'point'], 'cites'),
      link('2', ['note', 'q'], ['note', 'a'], 'related'),
    ];
    const wanted = [
      { relation: 'cites' as const, target_type: 'trial' as const, target_id: 'point' },
      { relation: 'supports' as const, target_type: 'note' as const, target_id: 'b' },
      { relation: 'supports' as const, target_type: 'note' as const, target_id: 'b' },
    ];
    const { create, remove } = diffOutgoingLinks(current, wanted);
    expect(create).toEqual([{ relation: 'supports', target_type: 'note', target_id: 'b' }]);
    expect(remove.map((l) => l.id)).toEqual(['2']);
  });
});

test('isLinkRelation', () => {
  expect(isLinkRelation('answers')).toBe(true);
  expect(isLinkRelation('refutes')).toBe(false);
});
