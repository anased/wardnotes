import {
  canonicalTagName,
  dedupeTags,
  hasTag,
  mergeTags,
  splitVisibleTags,
  normalizeTagName,
  validateTagName,
} from './tagUtils';

describe('tagUtils', () => {
  test('normalizeTagName trims and collapses whitespace', () => {
    expect(normalizeTagName('  heart   failure ')).toBe('heart failure');
  });

  test('hasTag ignores case and spacing', () => {
    expect(hasTag(['CHF', 'Cardiology'], ' chf ')).toBe(true);
    expect(hasTag(['CHF'], 'COPD')).toBe(false);
    expect(hasTag(undefined, 'CHF')).toBe(false);
  });

  test('canonicalTagName uses the existing spelling', () => {
    expect(canonicalTagName('chf', ['CHF', 'Cardiology'])).toBe('CHF');
    expect(canonicalTagName('  new  tag ', ['CHF'])).toBe('new tag');
  });

  test('dedupeTags keeps the first spelling and order', () => {
    expect(dedupeTags(['CHF', 'Heart', 'chf', ' ', 'heart'])).toEqual(['CHF', 'Heart']);
  });

  test('mergeTags preserves spelling and sorts ignoring case', () => {
    expect(mergeTags(['Cardiology', 'CHF'], ['chf', 'asthma'])).toEqual(['asthma', 'Cardiology', 'CHF']);
  });

  test('validateTagName rejects blank and overly long names', () => {
    expect(validateTagName('   ')).toBe('Tag name is required');
    expect(validateTagName('a'.repeat(51))).toMatch(/50 characters/);
    expect(validateTagName('CHF')).toBeNull();
  });
});

describe('splitVisibleTags', () => {
  it('shows up to max tags and puts the rest in hidden', () => {
    expect(splitVisibleTags(['A', 'B', 'C', 'D', 'E'], 3)).toEqual({
      visible: ['A', 'B', 'C'],
      hidden: ['D', 'E'],
    });
  });

  it('returns everything when under the limit', () => {
    expect(splitVisibleTags(['A', 'B'], 3)).toEqual({ visible: ['A', 'B'], hidden: [] });
  });

  it('handles missing tags', () => {
    expect(splitVisibleTags(undefined, 3)).toEqual({ visible: [], hidden: [] });
  });

  it('moves priority tags to the front, ignoring case', () => {
    expect(splitVisibleTags(['A', 'B', 'C', 'Stroke'], 3, ['stroke'])).toEqual({
      visible: ['Stroke', 'A', 'B'],
      hidden: ['C'],
    });
  });
});
