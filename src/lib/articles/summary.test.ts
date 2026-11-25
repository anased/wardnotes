import type { PubmedArticle } from '@/lib/trials/pubmed';
import type { ArticleCache, CachedArticle } from './cache';
import { PrimerRateLimitError, getArticleSummary, toMetadata, type ArticleSummaryDeps } from './summary';
import type { Primer } from './types';

// Keep the AI SDK out of this test: the model call is injected through deps.
jest.mock('./primer', () => ({ generatePrimer: jest.fn(), primerVersion: () => 'v1' }));

const RECORD: PubmedArticle = {
  pmid: '123',
  title: 'A trial',
  journal: 'J',
  year: 2020,
  doi: '10.1/x',
  pmcid: null,
  publicationTypes: ['Randomized Controlled Trial'],
  abstract: 'Events 5% vs 6%.',
};

const PRIMER: Primer = {
  question: 'Q?',
  bottomLine: 'B.',
  verdict: 'skim',
  verdictReason: 'R.',
  minutes: 10,
  abstractOnly: true,
  droppedSentences: 0,
  model: 'cheap',
  createdAt: '2026-11-25T00:00:00.000Z',
};

function setup(cached: CachedArticle | null, overrides: Partial<ArticleSummaryDeps> = {}) {
  const cache: ArticleCache = { get: jest.fn().mockResolvedValue(cached), put: jest.fn().mockResolvedValue(undefined) };
  const deps = {
    cache,
    fetchRecord: jest.fn().mockResolvedValue(RECORD),
    checkRateLimit: jest.fn().mockResolvedValue(undefined),
    makePrimer: jest.fn().mockResolvedValue({ primer: PRIMER, servedBy: { provider: 'anthropic', model: 'cheap' } }),
    version: 'v1',
    ...overrides,
  };
  return deps;
}

describe('getArticleSummary', () => {
  it('fetches, generates and caches on a miss', async () => {
    const deps = setup(null);
    const result = await getArticleSummary('123', deps);
    expect(result).toEqual({ metadata: toMetadata(RECORD), primer: PRIMER, primerCached: false });
    expect(deps.checkRateLimit).toHaveBeenCalled();
    expect(deps.cache.put).toHaveBeenCalledWith(toMetadata(RECORD), PRIMER, 'v1');
  });

  it('makes no calls at all on a fresh hit with a current primer', async () => {
    const deps = setup({ metadata: toMetadata(RECORD), fresh: true, primer: PRIMER, primerVersion: 'v1' });
    const result = await getArticleSummary('123', deps);
    expect(result.primerCached).toBe(true);
    expect(deps.fetchRecord).not.toHaveBeenCalled();
    expect(deps.makePrimer).not.toHaveBeenCalled();
    expect(deps.checkRateLimit).not.toHaveBeenCalled();
    expect(deps.cache.put).not.toHaveBeenCalled();
  });

  it('regenerates when the primer version is out of date', async () => {
    const deps = setup({ metadata: toMetadata(RECORD), fresh: true, primer: PRIMER, primerVersion: 'v0' });
    const result = await getArticleSummary('123', deps);
    expect(result.primerCached).toBe(false);
    expect(deps.fetchRecord).not.toHaveBeenCalled();
    expect(deps.makePrimer).toHaveBeenCalled();
  });

  it('refetches stale metadata and keeps the primer if the abstract is unchanged', async () => {
    const deps = setup({ metadata: toMetadata(RECORD), fresh: false, primer: PRIMER, primerVersion: 'v1' });
    const result = await getArticleSummary('123', deps);
    expect(deps.fetchRecord).toHaveBeenCalledWith('123');
    expect(result.primerCached).toBe(true);
    expect(deps.cache.put).toHaveBeenCalled();
  });

  it('regenerates when the refetched abstract changed', async () => {
    const old = { ...toMetadata(RECORD), abstract: 'Old text.' };
    const deps = setup({ metadata: old, fresh: false, primer: PRIMER, primerVersion: 'v1' });
    const result = await getArticleSummary('123', deps);
    expect(result.primerCached).toBe(false);
  });

  it('rejects articles with no abstract before charging the rate limit', async () => {
    const deps = setup(null, { fetchRecord: jest.fn().mockResolvedValue({ ...RECORD, abstract: '' }) });
    await expect(getArticleSummary('123', deps)).rejects.toMatchObject({ status: 422 });
    expect(deps.checkRateLimit).not.toHaveBeenCalled();
  });

  it('stops at the rate limit without calling the model', async () => {
    const deps = setup(null, { checkRateLimit: jest.fn().mockRejectedValue(new PrimerRateLimitError(50)) });
    await expect(getArticleSummary('123', deps)).rejects.toBeInstanceOf(PrimerRateLimitError);
    expect(deps.makePrimer).not.toHaveBeenCalled();
  });
});
