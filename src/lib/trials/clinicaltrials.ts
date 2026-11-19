// src/lib/trials/clinicaltrials.ts
// ClinicalTrials.gov API v2 client. Server-side only.
import { TrialSourceError } from './errors';

const CTGOV = 'https://clinicaltrials.gov/api/v2';
const FETCH_TIMEOUT_MS = 10_000;
const FIELDS = 'NCTId,Acronym,OfficialTitle,BriefTitle,ReferencesModule';

export interface RegistryStudy {
  nctId: string;
  acronym: string | null;
  officialTitle: string | null;
  briefTitle: string | null;
  /** PMIDs the registry lists as results publications. */
  resultPmids: string[];
}

interface RawStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; acronym?: string; officialTitle?: string; briefTitle?: string };
    referencesModule?: { references?: { pmid?: string; type?: string }[] };
  };
}

export function parseStudy(raw: RawStudy): RegistryStudy | null {
  const id = raw.protocolSection?.identificationModule;
  if (!id?.nctId) return null;
  const refs = raw.protocolSection?.referencesModule?.references ?? [];
  return {
    nctId: id.nctId,
    acronym: id.acronym ?? null,
    officialTitle: id.officialTitle ?? null,
    briefTitle: id.briefTitle ?? null,
    resultPmids: refs.filter((r) => r.type === 'RESULT' && r.pmid).map((r) => r.pmid as string),
  };
}

async function ctgovFetch(url: URL): Promise<Response | null> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    } catch {
      if (attempt < 2) continue;
      throw new TrialSourceError('Could not reach ClinicalTrials.gov. Please try again.', 502);
    }
    if (res.status === 404) return null;
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      continue;
    }
    throw new TrialSourceError(`ClinicalTrials.gov returned an error (${res.status}).`, 502);
  }
}

/** Normalize an acronym for comparison: "CHANCE-2" = "chance 2" = "CHANCE2". */
export function normalizeAcronym(s: string): string {
  return s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * ClinicalTrials.gov query.term for a name: the acronym field (with separator variants,
 * e.g. "CSPS.com" is stored as "CSPS・com") and, for multi-word names, the official title.
 * Restricting to these fields keeps common words ("POINT") from matching every study.
 */
export function registryTerm(query: string): string {
  const phrase = query.replace(/["\\()]/g, ' ').replace(/\s+/g, ' ').trim();
  const variants = [...new Set([phrase, phrase.replace(/[-.\s]+/g, ' ').trim()])];
  const clauses = variants.map((v) => `AREA[Acronym]"${v}"`);
  if (phrase.split(' ').length >= 3) clauses.push(`AREA[OfficialTitle]"${phrase}"`);
  return clauses.join(' OR ');
}

/** Does a registry study carry this name, as its acronym or (for long names) its official title? */
export function registryStudyMatches(study: RegistryStudy, query: string): boolean {
  const target = normalizeAcronym(query);
  if (!target) return false;
  if (study.acronym && normalizeAcronym(study.acronym) === target) return true;
  return query.trim().split(/\s+/).length >= 3 && !!study.officialTitle && normalizeAcronym(study.officialTitle).includes(target);
}

/** Registry studies matching a trial name (see registryTerm / registryStudyMatches). */
export async function searchRegistry(query: string): Promise<RegistryStudy[]> {
  const url = new URL(`${CTGOV}/studies`);
  url.searchParams.set('query.term', registryTerm(query));
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('pageSize', '25');
  const res = await ctgovFetch(url);
  if (!res) return [];
  const json = (await res.json()) as { studies?: RawStudy[] };
  return (json.studies ?? []).map(parseStudy).filter((s): s is RegistryStudy => s !== null);
}

export async function getRegistryStudy(nctId: string): Promise<RegistryStudy | null> {
  const url = new URL(`${CTGOV}/studies/${encodeURIComponent(nctId)}`);
  url.searchParams.set('fields', FIELDS);
  const res = await ctgovFetch(url);
  if (!res) return null;
  return parseStudy((await res.json()) as RawStudy);
}
