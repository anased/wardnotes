import { groupBySection, moveItem, unusedSuggestions } from './topicSections';

const sections = [
  { id: 'mgmt', name: 'Management', sort_order: 2 },
  { id: 'dx', name: 'Diagnosis', sort_order: 1 },
  { id: 'empty', name: 'Pearls', sort_order: 3 },
];

describe('groupBySection', () => {
  test('a topic with no sections shows everything under Unsorted', () => {
    const groups = groupBySection([], [{ section_id: null, id: 1 }, { section_id: null, id: 2 }]);
    expect(groups).toEqual([{ section: null, items: [{ section_id: null, id: 1 }, { section_id: null, id: 2 }] }]);
  });

  test('orders sections, hides empty ones and puts Unsorted last', () => {
    const links = [
      { section_id: 'mgmt', id: 'a' },
      { section_id: null, id: 'b' },
      { section_id: 'dx', id: 'c' },
    ];
    expect(groupBySection(sections, links).map((g) => [g.section?.name ?? 'Unsorted', g.items.map((i) => i.id)])).toEqual([
      ['Diagnosis', ['c']],
      ['Management', ['a']],
      ['Unsorted', ['b']],
    ]);
  });

  test('no Unsorted heading when every note has a section', () => {
    const groups = groupBySection(sections, [{ section_id: 'dx' }]);
    expect(groups.map((g) => g.section?.id)).toEqual(['dx']);
  });

  test('a link to a deleted section counts as Unsorted', () => {
    expect(groupBySection(sections, [{ section_id: 'gone' }])[0].section).toBeNull();
  });

  test('nothing to show when the topic has no notes', () => {
    expect(groupBySection(sections, [])).toEqual([]);
  });
});

describe('moveItem', () => {
  test('swaps with the neighbour and ignores moves past the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});

describe('unusedSuggestions', () => {
  test('drops suggestions the topic already has, ignoring case', () => {
    expect(unusedSuggestions(['Overview', 'Diagnosis', 'Cases'], [{ name: 'diagnosis ' }])).toEqual(['Overview', 'Cases']);
  });
});
