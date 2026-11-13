import {
  ensurePrimary,
  parseDraftLinks,
  sameLinks,
  sortForDisplay,
  withPrimary,
  withSection,
  withTopicIds,
} from './noteTopicLinks';

const link = (topic_id: string, is_primary = false, section_id: string | null = null) => ({
  topic_id,
  section_id,
  is_primary,
});

describe('ensurePrimary', () => {
  test('the first link becomes primary when none is', () => {
    expect(ensurePrimary([link('a'), link('b')]).map((l) => l.is_primary)).toEqual([true, false]);
  });

  test('keeps only the first of several primaries', () => {
    expect(ensurePrimary([link('a'), link('b', true), link('c', true)]).map((l) => l.is_primary)).toEqual([
      false,
      true,
      false,
    ]);
  });

  test('empty stays empty', () => {
    expect(ensurePrimary([])).toEqual([]);
  });
});

describe('withTopicIds', () => {
  test('adding the first topic makes it primary; later ones are not', () => {
    let links = withTopicIds([], ['pres']);
    expect(links).toEqual([link('pres', true)]);
    links = withTopicIds(links, ['pres', 'ncc', 'cv']);
    expect(links.filter((l) => l.is_primary).map((l) => l.topic_id)).toEqual(['pres']);
    expect(links).toHaveLength(3);
  });

  test('keeps sections of topics that stay; removing the primary promotes another', () => {
    const links = [link('a', true, 's1'), link('b', false, 's2'), link('c')];
    expect(withTopicIds(links, ['b', 'c'])).toEqual([link('b', true, 's2'), link('c')]);
  });
});

describe('withPrimary / withSection', () => {
  test('switching primary leaves exactly one', () => {
    const links = withPrimary([link('a', true), link('b'), link('c')], 'c');
    expect(links.filter((l) => l.is_primary).map((l) => l.topic_id)).toEqual(['c']);
  });

  test('sets a section on one topic only', () => {
    expect(withSection([link('a'), link('b')], 'b', 'dx')).toEqual([link('a'), link('b', false, 'dx')]);
  });
});

test('sortForDisplay puts the primary first and keeps the rest in order', () => {
  expect(sortForDisplay([link('a'), link('b', true), link('c')]).map((l) => l.topic_id)).toEqual(['b', 'a', 'c']);
});

test('sameLinks ignores order', () => {
  expect(sameLinks([link('a', true), link('b')], [link('b'), link('a', true)])).toBe(true);
  expect(sameLinks([link('a', true)], [link('a', true, 's')])).toBe(false);
});

test('parseDraftLinks drops malformed entries and fixes the primary', () => {
  expect(parseDraftLinks('nope')).toBeNull();
  expect(parseDraftLinks([{ topic_id: 'a', section_id: 5 }, null, { foo: 1 }])).toEqual([link('a', true)]);
});
