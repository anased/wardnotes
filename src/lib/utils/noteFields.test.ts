import { contentTypeOptions, typeCounts, typeFilterKey, typeFilterLabel } from './noteFields';

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

describe('contentTypeOptions', () => {
  const values = (opts: { value: string }[]) => opts.map((o) => o.value);

  test('leaves out the retired Trial type by default', () => {
    expect(values(contentTypeOptions('No type'))).toEqual(['', 'question', 'article', 'review', 'case', 'other']);
  });

  test('keeps Trial for a note that already has it', () => {
    expect(values(contentTypeOptions('No type', ['trial', '']))).toContain('trial');
    expect(values(contentTypeOptions('No type', [null, 'review']))).not.toContain('trial');
  });
});
