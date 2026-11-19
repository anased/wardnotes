// src/lib/trials/ncbi.ts
// NCBI E-utilities client. Server-side only (never call NCBI from the browser).
//
// Etiquette (https://www.ncbi.nlm.nih.gov/books/NBK25497/):
// - every request carries `tool` and, if NCBI_EMAIL is set, `email`;
// - NCBI_API_KEY (optional) is sent as `api_key` and raises the limit;
// - requests are spaced to stay under 3 req/s (10 req/s with a key). The limiter is
//   per server instance, so it bounds each instance, not the whole deployment;
// - 429 / 5xx responses are retried with exponential backoff (honouring Retry-After).
import { TrialSourceError } from './errors';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;

/** Minimum spacing between requests, with a small margin under NCBI's limits. */
export function ncbiMinIntervalMs(hasApiKey: boolean): number {
  return hasApiKey ? 110 : 350;
}

let nextSlot = 0;

/** Wait for this instance's next free request slot. */
async function acquireSlot(): Promise<void> {
  const interval = ncbiMinIntervalMs(!!process.env.NCBI_API_KEY);
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + interval;
  if (start > now) await sleep(start - now);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff before retry `attempt` (1-based), honouring a Retry-After header in seconds. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000);
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

export function ncbiUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${EUTILS}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('tool', process.env.NCBI_TOOL || 'wardnotes');
  if (process.env.NCBI_EMAIL) url.searchParams.set('email', process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) url.searchParams.set('api_key', process.env.NCBI_API_KEY);
  return url;
}

export async function ncbiFetch(path: string, params: Record<string, string>): Promise<Response> {
  const url = ncbiUrl(path, params);

  for (let attempt = 1; ; attempt++) {
    await acquireSlot();
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    } catch {
      if (attempt < 2) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new TrialSourceError('Could not reach PubMed. Please try again.', 502);
    }
    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt, res.headers.get('retry-after')));
      continue;
    }
    if (res.status === 429) {
      throw new TrialSourceError('PubMed is busy right now. Please try again in a minute.', 503);
    }
    throw new TrialSourceError(`PubMed returned an error (${res.status}). Please try again.`, 502);
  }
}

// ---------------------------------------------------------------------------
// ESearch / ESummary (JSON)

export async function esearch(term: string, opts: { retmax?: number; sort?: 'relevance' | 'pub_date' } = {}): Promise<string[]> {
  const res = await ncbiFetch('esearch.fcgi', {
    db: 'pubmed',
    term,
    retmode: 'json',
    retmax: String(opts.retmax ?? 10),
    sort: opts.sort ?? 'relevance',
  });
  const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
  return json.esearchresult?.idlist ?? [];
}

export interface PubmedSummary {
  pmid: string;
  title: string;
  /** Full journal name, e.g. "The New England journal of medicine". */
  journal: string | null;
  /** NLM abbreviation, e.g. "N Engl J Med". */
  journalAbbrev: string | null;
  year: number | null;
  firstAuthor: string | null;
  doi: string | null;
  pubTypes: string[];
  /** Number of "Comment in" links (editorials/letters about it): high for primary results papers. */
  commentCount: number;
}

interface RawSummary {
  uid?: string;
  error?: string;
  title?: string;
  source?: string;
  fulljournalname?: string;
  pubdate?: string;
  sortpubdate?: string;
  authors?: { name: string; authtype?: string }[];
  pubtype?: string[];
  articleids?: { idtype: string; value: string }[];
  references?: { reftype?: string }[];
}

function cleanTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

export function parseSummary(pmid: string, raw: RawSummary): PubmedSummary | null {
  if (!raw || raw.error || !raw.title) return null;
  const yearMatch = (raw.pubdate ?? raw.sortpubdate ?? '').match(/\d{4}/);
  const authors = raw.authors ?? [];
  const firstAuthor = authors.find((a) => a.authtype === 'Author')?.name ?? authors[0]?.name ?? null;
  return {
    pmid,
    title: cleanTitle(raw.title),
    journal: raw.fulljournalname ?? null,
    journalAbbrev: raw.source ?? null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    firstAuthor,
    doi: raw.articleids?.find((a) => a.idtype === 'doi')?.value ?? null,
    pubTypes: raw.pubtype ?? [],
    commentCount: (raw.references ?? []).filter((r) => r.reftype === 'Comment in').length,
  };
}

export async function esummary(pmids: string[]): Promise<PubmedSummary[]> {
  if (pmids.length === 0) return [];
  const res = await ncbiFetch('esummary.fcgi', { db: 'pubmed', id: pmids.join(','), retmode: 'json' });
  const json = (await res.json()) as { result?: Record<string, RawSummary> };
  const result = json.result ?? {};
  return pmids
    .map((pmid) => parseSummary(pmid, result[pmid]))
    .filter((s): s is PubmedSummary => s !== null);
}
