// src/lib/trials/pubmed.ts
// Resolve a user-supplied identifier (PMID, DOI, PMCID, or a PubMed/journal URL)
// to a PubMed record and its abstract, via NCBI E-utilities. Server-side only.
import { ncbiFetch } from './ncbi';
import { TrialSourceError } from './errors';
import type { TrialSourceIdentifier } from './identify';

export { MIN_PASTED_ABSTRACT_LENGTH, parseTrialIdentifier, type TrialSourceIdentifier } from './identify';
export { TrialSourceError } from './errors';

export interface PubmedArticle {
  pmid: string;
  title: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  /** PubMed Central ID (e.g. "PMC6097526") when the article is in PMC. */
  pmcid: string | null;
  /** PubMed publication types, e.g. ["Randomized Controlled Trial", "Journal Article"]. */
  publicationTypes: string[];
  abstract: string;
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

  const pmcidXml = first(article, /<ArticleId IdType="pmc">([\s\S]*?)<\/ArticleId>/);
  const publicationTypes = [
    ...article.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g),
  ].map((m) => text(m[1]));

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
    pmcid: pmcidXml ? text(pmcidXml) : null,
    publicationTypes: publicationTypes.filter(Boolean),
    abstract: sections.join('\n\n'),
  };
}

/** The PubMed record for a PMID, whether or not it has an abstract. */
export async function fetchPubmedRecord(pmid: string): Promise<PubmedArticle> {
  const res = await ncbiFetch('efetch.fcgi', { db: 'pubmed', id: pmid, retmode: 'xml' });
  const article = parsePubmedXml(await res.text());
  if (!article) {
    throw new TrialSourceError(`No PubMed record found for PMID ${pmid}.`, 404);
  }
  return article;
}

/** The PubMed record for a PMID; throws if it has no abstract to extract a trial from. */
export async function fetchPubmedArticle(pmid: string): Promise<PubmedArticle> {
  const article = await fetchPubmedRecord(pmid);
  if (!article.abstract) {
    throw new TrialSourceError(
      `PubMed has no abstract for "${article.title}". Paste the abstract text instead.`,
      422
    );
  }
  return article;
}
