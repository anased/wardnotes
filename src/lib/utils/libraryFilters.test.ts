import {
  EMPTY_FILTERS,
  buildLibraryQuery,
  hasFieldFilters,
  legacyCategoryParam,
  parseLibraryParams,
} from './libraryFilters';

describe('parseLibraryParams', () => {
  test('returns empty filters for an empty query', () => {
    expect(parseLibraryParams('')).toEqual(EMPTY_FILTERS);
  });

  test('reads several tags, status and type', () => {
    expect(
      parseLibraryParams('?tag=Stroke&tag=ICH&status=unanswered&type=question')
    ).toEqual({
      q: '',
      tags: ['Stroke', 'ICH'],
      status: 'unanswered',
      contentType: 'question',
      topic: '',
    });
  });

  test('reads a topic id and ignores anything that is not one', () => {
    const id = '0b9b7a52-3c1e-4f43-9d0e-6a1d2c3b4a5f';
    expect(parseLibraryParams(`?topic=${id}`).topic).toBe(id);
    expect(parseLibraryParams('?topic=PRES').topic).toBe('');
    expect(hasFieldFilters(parseLibraryParams(`?topic=${id}`))).toBe(true);
    expect(buildLibraryQuery({ ...EMPTY_FILTERS, topic: id })).toBe(`topic=${id}`);
  });

  describe('old ?category= links', () => {
    const neuroId = '0b9b7a52-3c1e-4f43-9d0e-6a1d2c3b4a5f';
    const roots: Record<string, string> = { neurology: neuroId };
    const findRoot = (name: string) => roots[name.toLowerCase()];

    test('map to the root topic with that name (ignoring case)', () => {
      expect(parseLibraryParams('?category=NEUROLOGY&tag=Stroke', findRoot)).toEqual({
        ...EMPTY_FILTERS,
        tags: ['Stroke'],
        topic: neuroId,
      });
      expect(legacyCategoryParam('?category=%20Neurology%20')).toBe('Neurology');
    });

    test('are ignored when no root topic matches, or without a resolver', () => {
      expect(parseLibraryParams('?category=Dermatology', findRoot)).toEqual(EMPTY_FILTERS);
      expect(parseLibraryParams('?category=Neurology')).toEqual(EMPTY_FILTERS);
      expect(legacyCategoryParam('?tag=x')).toBe('');
    });

    test('an explicit topic wins', () => {
      const other = '1b9b7a52-3c1e-4f43-9d0e-6a1d2c3b4a5f';
      expect(parseLibraryParams(`?category=Neurology&topic=${other}`, findRoot).topic).toBe(other);
    });

    test('are never written back', () => {
      expect(buildLibraryQuery(parseLibraryParams('?category=Neurology', findRoot))).toBe(`topic=${neuroId}`);
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

  test('keeps a search query together with the other filters', () => {
    expect(parseLibraryParams('?q=apixaban&tag=Stroke&status=unanswered')).toEqual({
      ...EMPTY_FILTERS,
      q: 'apixaban',
      tags: ['Stroke'],
      status: 'unanswered',
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
      tags: ['Stroke', "Parkinson's disease"],
      status: 'answered' as const,
      contentType: 'trial' as const,
      topic: '0b9b7a52-3c1e-4f43-9d0e-6a1d2c3b4a5f',
    };
    expect(parseLibraryParams(buildLibraryQuery(filters))).toEqual(filters);
  });

  test('writes the search together with the other filters', () => {
    expect(buildLibraryQuery({ ...EMPTY_FILTERS, q: ' tPA ', tags: ['Stroke'] })).toBe('q=tPA&tag=Stroke');
    const filters = { ...EMPTY_FILTERS, q: 'pres', status: 'unanswered' as const, contentType: 'trial' as const };
    expect(parseLibraryParams(buildLibraryQuery(filters))).toEqual(filters);
  });
});

describe('hasFieldFilters', () => {
  test('ignores the search query', () => {
    expect(hasFieldFilters({ ...EMPTY_FILTERS, q: 'x' })).toBe(false);
    expect(hasFieldFilters({ ...EMPTY_FILTERS, status: 'unanswered' })).toBe(true);
  });
});
