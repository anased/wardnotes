// src/lib/trials/searchTrials.ts
// Find a trial's publications from its name/acronym or NCT number, using only free
// public APIs (PubMed E-utilities + ClinicalTrials.gov). No LLM. Server-side only.
import { getRegistryStudy, registryStudyMatches, searchRegistry, type RegistryStudy } from './clinicaltrials';
import { TrialSourceError } from './errors';
import { esearch, esummary } from './ncbi';
import { rankCandidates, type CandidateInput, type TrialCandidate } from './rankCandidates';
import type { SearchCache } from './searchCache';

export type { TrialCandidate } from './rankCandidates';

/** How many ranked candidates the API returns (the UI shows the top 3). */
export const MAX_CANDIDATES = 5;
const PUBMED_RETMAX = 10;
const LINKED_RETMAX = 15;
/** Registry studies to follow into PubMed (one [si] search each). */
const MAX_REGISTRY_STUDIES = 5;
const MAX_SUMMARIES = 50;

const TRIAL_PT = '(randomized controlled trial[pt] OR clinical trial[pt])';

export interface RegistryMatch {
  nctId: string;
  acronym: string | null;
  title: string | null;
}

export interface TrialSearchResult {
  query: string;
  kind: 'name' | 'nct';
  candidates: TrialCandidate[];
  /** Exact-acronym (or the looked-up NCT) registry studies. */
  registryMatches: RegistryMatch[];
  /** The name could refer to more than one trial, or nothing names it exactly. */
  ambiguous: boolean;
  /** Message to show the user (no results, ambiguity, partial results). */
  notice: string | null;
  /** Sources that failed; results are partial (and not cached) when non-empty. */
  failedSources: ('pubmed' | 'clinicaltrials')[];
  cached?: boolean;
}

export function searchCacheKey(kind: 'name' | 'nct', query: string): string {
  return `${kind}:${kind === 'nct' ? query.toUpperCase() : query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function phraseOf(query: string): string {
  return query.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** PubMed term for a name search: the phrase in title/abstract, restricted to trials. */
export function pubmedNameTerm(query: string): string {
  return `"${phraseOf(query)}"[Title/Abstract] AND ${TRIAL_PT}`;
}

/** PubMed term for papers authored by the trial group ("CSPS.com Trial Investigators"). */
export function pubmedGroupTerm(query: string): string {
  return `"${phraseOf(query)}"[Corporate Author] AND ${TRIAL_PT}`;
}

/** Papers on which PubMed indexes this NCT number as a secondary source ID. */
function siTerm(nctId: string): string {
  return `${nctId}[si]`;
}

function toMatch(s: RegistryStudy): RegistryMatch {
  return { nctId: s.nctId, acronym: s.acronym, title: s.officialTitle ?? s.briefTitle };
}

/** Fetch summaries and rank: shared tail of both search kinds. */
interface Linked {
  pmid: string;
  nctId: string;
  /** 'si': PubMed links the paper to the NCT number; 'reference': the registry lists it as a result. */
  via: 'si' | 'reference';
}

async function rankPmids(
  query: string,
  pubmedIds: string[],
  groupIds: string[],
  linked: Linked[]
): Promise<TrialCandidate[]> {
  // Interleave sources so a cap never drops one source's best hits entirely.
  const lists = [linked.map((l) => l.pmid), groupIds, pubmedIds];
  const order: string[] = [];
  for (let i = 0; order.length < MAX_SUMMARIES && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && !order.includes(l[i])) order.push(l[i]);
  }
  const summaries = await esummary(order.slice(0, MAX_SUMMARIES));
  const inputs: CandidateInput[] = [];
  for (const s of summaries) {
    const rank = pubmedIds.indexOf(s.pmid);
    const links = linked.filter((l) => l.pmid === s.pmid);
    inputs.push({
      ...s,
      pubmedRank: rank >= 0 ? rank : null,
      corporateAuthor: groupIds.includes(s.pmid),
      nctIds: [...new Set(links.map((l) => l.nctId))],
      registryLinked: links.some((l) => l.via === 'si'),
      registryResult: links.some((l) => l.via === 'reference'),
    });
  }
  return rankCandidates(inputs, query).slice(0, MAX_CANDIDATES);
}

async function searchByName(query: string): Promise<TrialSearchResult> {
  const failedSources: TrialSearchResult['failedSources'] = [];
  const [pubmed, group, registry] = await Promise.allSettled([
    esearch(pubmedNameTerm(query), { retmax: PUBMED_RETMAX }),
    esearch(pubmedGroupTerm(query), { retmax: PUBMED_RETMAX }),
    searchRegistry(query),
  ]);
  if (pubmed.status === 'rejected' || group.status === 'rejected') failedSources.push('pubmed');
  if (registry.status === 'rejected') failedSources.push('clinicaltrials');
  if (failedSources.length === 2) {
    throw new TrialSourceError("Couldn't reach PubMed or ClinicalTrials.gov. Check your connection and try again.", 502);
  }

  const pubmedIds = pubmed.status === 'fulfilled' ? pubmed.value : [];
  const groupIds = group.status === 'fulfilled' ? group.value : [];
  const exact = (registry.status === 'fulfilled' ? registry.value : [])
    .filter((s) => registryStudyMatches(s, query))
    .slice(0, MAX_REGISTRY_STUDIES);

  // Papers PubMed links to each registry entry. One search per study, so a trial
  // with few papers isn't crowded out by a namesake with many.
  const linked: Linked[] = [];
  if (exact.length > 0 && !failedSources.includes('pubmed')) {
    const perStudy = await Promise.allSettled(
      exact.map((s) => esearch(siTerm(s.nctId), { retmax: LINKED_RETMAX }))
    );
    perStudy.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        for (const pmid of r.value) linked.push({ pmid, nctId: exact[i].nctId, via: 'si' });
      } else if (!failedSources.includes('pubmed')) {
        failedSources.push('pubmed');
      }
    });
  }
  for (const s of exact) {
    for (const pmid of s.resultPmids) linked.push({ pmid, nctId: s.nctId, via: 'reference' });
  }

  let candidates: TrialCandidate[] = [];
  if (!failedSources.includes('pubmed')) {
    candidates = await rankPmids(query, pubmedIds, groupIds, linked);
  }

  const distinctTrials = exact.length;
  const named = candidates.length > 0 && candidates[0].acronymMatch !== null;
  let notice: string | null = null;
  let ambiguous = false;
  if (candidates.length === 0) {
    notice = failedSources.includes('pubmed')
      ? "Couldn't reach PubMed. Please try again, or enter the PMID/DOI."
      : `No trial publications found for "${query}". Try the full trial name, or enter the PMID/DOI.`;
  } else if (distinctTrials > 1) {
    ambiguous = true;
    notice = `${distinctTrials} registered trials are called "${query}". Check the journal, year and authors before picking one.`;
  } else if (!named) {
    ambiguous = true;
    notice = `Nothing is clearly named "${query}". These are the closest matches; check before picking one.`;
  }
  if (failedSources.includes('clinicaltrials') && candidates.length > 0) {
    notice = [notice, 'ClinicalTrials.gov was unreachable, so results may be less accurate.'].filter(Boolean).join(' ');
  }

  return { query, kind: 'name', candidates, registryMatches: exact.map(toMatch), ambiguous, notice, failedSources };
}

async function searchByNct(nctId: string): Promise<TrialSearchResult> {
  const study = await getRegistryStudy(nctId);
  if (!study) {
    throw new TrialSourceError(`No ClinicalTrials.gov record found for ${nctId}.`, 404);
  }
  const siIds = await esearch(siTerm(nctId), { retmax: LINKED_RETMAX });
  const linked: Linked[] = [
    ...siIds.map((pmid) => ({ pmid, nctId, via: 'si' as const })),
    ...study.resultPmids.map((pmid) => ({ pmid, nctId, via: 'reference' as const })),
  ];
  const candidates = await rankPmids(study.acronym ?? '', [], [], linked);
  return {
    query: nctId,
    kind: 'nct',
    candidates,
    registryMatches: [toMatch(study)],
    ambiguous: false,
    notice:
      candidates.length === 0
        ? `No publications are linked to ${nctId}${study.acronym ? ` (${study.acronym})` : ''} yet. Enter the PMID or DOI instead.`
        : null,
    failedSources: [],
  };
}

/**
 * Search by trial name or NCT number, using the cache when possible.
 * Throws TrialSourceError for user-facing failures (not found, sources unreachable).
 */
export async function searchTrials(
  query: { kind: 'name' | 'nct'; value: string },
  cache?: SearchCache<TrialSearchResult>
): Promise<TrialSearchResult> {
  const key = searchCacheKey(query.kind, query.value);
  const hit = await cache?.get(key);
  if (hit) return { ...hit, query: query.value, cached: true };

  const result = query.kind === 'nct' ? await searchByNct(query.value) : await searchByName(query.value);
  if (cache && result.failedSources.length === 0) await cache.set(key, result);
  return result;
}
