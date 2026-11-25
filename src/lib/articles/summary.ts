// src/lib/articles/summary.ts
// The shared part of adding an article: its PubMed metadata and primer, from the
// cache when possible. Server-side only.
import type { AiCallRecord } from '@/lib/ai/usage';
import { TrialSourceError } from '@/lib/trials/errors';
import { fetchPubmedRecord, type PubmedArticle } from '@/lib/trials/pubmed';
import type { ArticleCache } from './cache';
import { generatePrimer, primerVersion } from './primer';
import type { ArticleMetadata, Primer } from './types';

export class PrimerRateLimitError extends Error {
  constructor(public limit: number) {
    super(`You've added ${limit} new articles in the last 24 hours. Try again tomorrow.`);
    this.name = 'PrimerRateLimitError';
  }
}

export interface ArticleSummaryDeps {
  cache: ArticleCache;
  fetchRecord?: (pmid: string) => Promise<PubmedArticle>;
  /** Throws PrimerRateLimitError if the user may not generate another primer now. */
  checkRateLimit: () => Promise<void>;
  makePrimer?: typeof generatePrimer;
  version?: string;
}

export interface ArticleSummary {
  metadata: ArticleMetadata;
  primer: Primer;
  /** True when the primer came from the cache (no model call, nothing to log). */
  primerCached: boolean;
}

export function toMetadata(record: PubmedArticle): ArticleMetadata {
  return {
    pmid: record.pmid,
    doi: record.doi,
    pmcid: record.pmcid,
    title: record.title,
    journal: record.journal,
    year: record.year,
    abstract: record.abstract,
    publicationTypes: record.publicationTypes,
  };
}

/**
 * Metadata and primer for a PMID. Uses cached metadata while fresh and a cached
 * primer while its prompt/model version is current; otherwise fetches PubMed and/or
 * generates the primer (rate-limited), then updates the cache. Every model call is
 * appended to `calls`.
 */
export async function getArticleSummary(
  pmid: string,
  deps: ArticleSummaryDeps,
  calls: AiCallRecord[] = []
): Promise<ArticleSummary> {
  const { cache, checkRateLimit } = deps;
  const fetchRecord = deps.fetchRecord ?? fetchPubmedRecord;
  const makePrimer = deps.makePrimer ?? generatePrimer;
  const version = deps.version ?? primerVersion();

  const cached = await cache.get(pmid);
  const metadata = cached?.fresh ? cached.metadata : toMetadata(await fetchRecord(pmid));

  const cachedPrimer = cached?.primer && cached.primerVersion === version ? cached.primer : null;
  // Metadata that changed (e.g. a corrected abstract) needs a new primer.
  if (cachedPrimer && cached && cached.metadata.abstract === metadata.abstract) {
    if (!cached.fresh) await cache.put(metadata, cachedPrimer, version);
    return { metadata, primer: cachedPrimer, primerCached: true };
  }

  if (!metadata.abstract.trim()) {
    throw new TrialSourceError(
      `PubMed has no abstract for "${metadata.title}", so there's nothing to build a primer from yet. PDF upload is coming soon.`,
      422
    );
  }

  await checkRateLimit();
  const { primer } = await makePrimer(metadata, calls);
  await cache.put(metadata, primer, version);
  return { metadata, primer, primerCached: false };
}
