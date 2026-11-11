import {
  EMPTY_FILTERS,
  buildLibraryQuery,
  hasFieldFilters,
  parseLibraryParams,
} from './libraryFilters';

describe('parseLibraryParams', () => {
  test('returns empty filters for an empty query', () => {
    expect(parseLibraryParams('')).toEqual(EMPTY_FILTERS);
  });

  test('reads category, several tags, status and type', () => {
    expect(
      parseLibraryParams('?category=Neurology&tag=Stroke&tag=ICH&status=unanswered&type=question')
    ).toEqual({
      q: '',
      category: 'Neurology',
      tags: ['Stroke', 'ICH'],
      status: 'unanswered',
      contentType: 'question',
    });
  });

  test('keeps working with the old single ?tag= links', () => {
    expect(parseLibraryParams('?tag=Stroke').tags).toEqual(['Stroke']);
  });

  test('ignores unknown status and type values', () => {
    const f = parseLibraryParams('?status=maybe&type=podcast');
    expect(f.status).toBe('');
    expect(f.contentType).toBe('');
  });

  test('drops blank and case-insensitive duplicate tags', () => {
    expect(parseLibraryParams('?tag=Stroke&tag=&tag=stroke&tag=%20ICH%20').tags).toEqual([
      'Stroke',
      'ICH',
    ]);
  });

  test('a search query takes precedence over other filters', () => {
    expect(parseLibraryParams('?q=apixaban&tag=Stroke&status=unanswered')).toEqual({
      ...EMPTY_FILTERS,
      q: 'apixaban',
    });
  });
});

describe('buildLibraryQuery', () => {
  test('is empty when nothing is filtered', () => {
    expect(buildLibraryQuery(EMPTY_FILTERS)).toBe('');
  });

  test('round-trips through parseLibraryParams', () => {
    const filters = {
      q: '',
      category: 'Neurology new',
      tags: ['Stroke', "Parkinson's disease"],
      status: 'answered' as const,
      contentType: 'trial' as const,
    };
    expect(parseLibraryParams(buildLibraryQuery(filters))).toEqual(filters);
  });

  test('writes only the search when searching', () => {
    expect(buildLibraryQuery({ ...EMPTY_FILTERS, q: ' tPA ', tags: ['Stroke'] })).toBe('q=tPA');
  });
});

describe('hasFieldFilters', () => {
  test('ignores the search query', () => {
    expect(hasFieldFilters({ ...EMPTY_FILTERS, q: 'x' })).toBe(false);
    expect(hasFieldFilters({ ...EMPTY_FILTERS, status: 'unanswered' })).toBe(true);
  });
});
