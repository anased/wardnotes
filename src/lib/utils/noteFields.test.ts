import { typeCounts, typeFilterKey, typeFilterLabel } from './noteFields';

describe('type filter helpers', () => {
  test('counts the types present, in type order, no type last', () => {
    const notes = [
      { t: 'review' as const },
      { t: null },
      { t: 'question' as const },
      { t: 'review' as const },
      { t: 'question' as const },
      { t: 'question' as const },
    ];
    expect(typeCounts(notes, (n) => n.t)).toEqual([
      { key: 'question', count: 3 },
      { key: 'review', count: 2 },
      { key: 'none', count: 1 },
    ]);
  });

  test('empty list has no types', () => {
    expect(typeCounts([], () => null)).toEqual([]);
  });

  test('keys and labels', () => {
    expect(typeFilterKey('case')).toBe('case');
    expect(typeFilterKey(null)).toBe('none');
    expect(typeFilterKey(undefined)).toBe('none');
    expect(typeFilterLabel('question')).toBe('Question');
    expect(typeFilterLabel('none')).toBe('No type');
  });
});
