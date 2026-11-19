// src/lib/trials/identify.ts
// Work out what the user typed into the trial source box. Client-safe (no fetches):
// the UI uses this to decide between the direct extraction flow and name search.

/** Pasted text at least this long is treated as the abstract itself. */
export const MIN_PASTED_ABSTRACT_LENGTH = 200;

export type TrialSourceIdentifier =
  | { kind: 'pmid'; value: string }
  | { kind: 'doi'; value: string }
  | { kind: 'pmcid'; value: string }
  | { kind: 'text'; value: string };

/**
 * Work out what kind of identifier the user gave us. Order matters: PubMed URLs
 * carry a PMID, journal URLs usually embed the DOI, and PMC URLs carry a PMCID.
 */
export function parseTrialIdentifier(raw: string): TrialSourceIdentifier | null {
  const input = raw.trim();
  if (!input) return null;

  // Long free text: the user pasted the abstract itself.
  if (input.length >= MIN_PASTED_ABSTRACT_LENGTH && /\s/.test(input)) {
    return { kind: 'text', value: input };
  }

  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    // keep the raw string if it isn't valid URI encoding
  }

  const pubmedUrl = decoded.match(/(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d{1,9})\b/i);
  if (pubmedUrl) return { kind: 'pmid', value: pubmedUrl[1] };

  const pmid = decoded.match(/^(?:pmid\s*:?\s*)?(\d{1,9})$/i);
  if (pmid) return { kind: 'pmid', value: pmid[1] };

  const doi = decoded.match(/\b(10\.\d{4,9}\/[^\s"<>]+)/);
  if (doi) {
    // Strip URL query/fragment and trailing punctuation picked up from prose or links.
    const value = doi[1].replace(/[?#].*$/, '').replace(/[.,;:)\]}>'"]+$/, '');
    return { kind: 'doi', value };
  }

  const pmcid = decoded.match(/\bPMC\s*(\d{4,10})\b/i);
  if (pmcid) return { kind: 'pmcid', value: `PMC${pmcid[1]}` };

  return null;
}

export type TrialQuery =
  | TrialSourceIdentifier
  | { kind: 'nct'; value: string }
  | { kind: 'name'; value: string };

/** Longest input treated as a trial name; anything longer must be an identifier or an abstract. */
export const MAX_NAME_QUERY_LENGTH = 120;

/**
 * Classify free text from the trial source box:
 *   pasted abstract (long text) | PMID | DOI | PMCID | PubMed/journal URL  -> existing extraction flow
 *   NCT number (or ClinicalTrials.gov link)                              -> registry lookup
 *   anything else short with a letter in it                              -> name/acronym search
 */
export function detectTrialQuery(raw: string): TrialQuery | null {
  const input = raw.trim();
  if (!input) return null;

  const id = parseTrialIdentifier(input);
  if (id?.kind === 'text') return id;

  const nct = input.match(/^(?:.*[/=])?(NCT)\s*(\d{8})(?![\d])/i);
  if (nct && input.length <= MAX_NAME_QUERY_LENGTH) return { kind: 'nct', value: `NCT${nct[2]}` };

  if (id) return id;

  const name = input.replace(/\s+/g, ' ');
  if (name.length <= MAX_NAME_QUERY_LENGTH && /\p{L}/u.test(name) && !/^https?:\/\//i.test(name)) {
    return { kind: 'name', value: name };
  }
  return null;
}
