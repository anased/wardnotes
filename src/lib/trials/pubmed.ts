// src/lib/trials/pubmed.ts
// Resolve a user-supplied identifier (PMID, DOI, PMCID, or a PubMed/journal URL)
// to a PubMed record and its abstract, via NCBI E-utilities. Server-side only.

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_TOOL = 'wardnotes';
const FETCH_TIMEOUT_MS = 10_000;

/** Pasted text at least this long is treated as the abstract itself. */
export const MIN_PASTED_ABSTRACT_LENGTH = 200;

export type TrialSourceIdentifier =
  | { kind: 'pmid'; value: string }
  | { kind: 'doi'; value: string }
  | { kind: 'pmcid'; value: string }
  | { kind: 'text'; value: string };

export interface PubmedArticle {
  pmid: string;
  title: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  abstract: string;
}

export class TrialSourceError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TrialSourceError';
  }
}

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

async function ncbiFetch(path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${EUTILS}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('tool', NCBI_TOOL);
  if (process.env.NCBI_API_KEY) url.searchParams.set('api_key', process.env.NCBI_API_KEY);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
  } catch {
    throw new TrialSourceError('Could not reach PubMed. Please try again.', 502);
  }
  if (!res.ok) {
    throw new TrialSourceError(`PubMed returned an error (${res.status}). Please try again.`, 502);
  }
  return res;
}

/** Search PubMed for a single PMID matching a field-tagged term. */
async function searchPmid(term: string): Promise<string | null> {
  const res = await ncbiFetch('esearch.fcgi', { db: 'pubmed', term, retmode: 'json', retmax: '2' });
  const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
  const ids = json.esearchresult?.idlist ?? [];
  return ids.length === 1 ? ids[0] : null;
}

export async function resolvePmid(id: Exclude<TrialSourceIdentifier, { kind: 'text' }>): Promise<string> {
  if (id.kind === 'pmid') return id.value;

  const term = id.kind === 'doi' ? `"${id.value}"[doi]` : `${id.value}[pmcid]`;
  const pmid = await searchPmid(term);
  if (!pmid) {
    const label = id.kind === 'doi' ? 'DOI' : 'PMC ID';
    throw new TrialSourceError(`No PubMed record found for ${label} ${id.value}.`, 404);
  }
  return pmid;
}

// ---------- PubMed XML parsing (only the few fields we need) ----------

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Inner text of an XML fragment: drop inline tags (<i>, <sup>…), decode entities, collapse whitespace. */
function text(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function first(xml: string, re: RegExp): string | null {
  const m = xml.match(re);
  return m ? m[1] : null;
}

export function parsePubmedXml(xml: string): PubmedArticle | null {
  const articleXml = first(xml, /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/);
  if (!articleXml) return null;

  // References carry their own ArticleIds/DOIs; drop them so we only see this article's.
  const article = articleXml.replace(/<ReferenceList>[\s\S]*?<\/ReferenceList>/g, '');

  const pmid = first(article, /<PMID[^>]*>(\d+)<\/PMID>/);
  const titleXml = first(article, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
  if (!pmid || titleXml === null) return null;

  const journalXml = first(article, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);

  const pubDate = first(article, /<PubDate>([\s\S]*?)<\/PubDate>/) ?? '';
  const yearStr =
    first(pubDate, /<Year>(\d{4})<\/Year>/) ??
    first(pubDate, /<MedlineDate>(\d{4})/) ??
    first(article, /<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>/);

  const doiXml =
    first(article, /<ELocationID[^>]*EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/) ??
    first(article, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);

  // Main abstract only (not <OtherAbstract>, e.g. translations or plain-language summaries).
  const abstractXml = first(article, /<Abstract>([\s\S]*?)<\/Abstract>/) ?? '';
  const sections: string[] = [];
  for (const m of abstractXml.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
    const label = first(m[1], /Label="([^"]*)"/);
    const body = text(m[2]);
    if (body) sections.push(label ? `${decodeEntities(label)}: ${body}` : body);
  }

  return {
    pmid,
    title: text(titleXml),
    journal: journalXml ? text(journalXml) : null,
    year: yearStr ? Number(yearStr) : null,
    doi: doiXml ? text(doiXml) : null,
    abstract: sections.join('\n\n'),
  };
}

export async function fetchPubmedArticle(pmid: string): Promise<PubmedArticle> {
  const res = await ncbiFetch('efetch.fcgi', { db: 'pubmed', id: pmid, retmode: 'xml' });
  const article = parsePubmedXml(await res.text());
  if (!article) {
    throw new TrialSourceError(`No PubMed record found for PMID ${pmid}.`, 404);
  }
  if (!article.abstract) {
    throw new TrialSourceError(
      `PubMed has no abstract for "${article.title}". Paste the abstract text instead.`,
      422
    );
  }
  return article;
}
