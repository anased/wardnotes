// src/lib/articles/fullText.ts
// Find an article's free full text: PubMed Central first, then an open-access PDF
// via Unpaywall. No AI, nothing charged. Server-side only.
import { ncbiFetch } from '@/lib/trials/ncbi';
import { pdfToSections } from './pdf';
import { parseJatsSections, type ArticleSection } from './sections';
import type { FullTextSource } from './types';

export interface FullText {
  source: Extract<FullTextSource, 'pmc' | 'unpaywall'>;
  sections: ArticleSection[];
}

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** PMC's JATS full text, or null if PMC withholds the body or the request fails. */
export async function fetchPmcSections(pmcid: string): Promise<ArticleSection[] | null> {
  const id = pmcid.replace(/^PMC/i, '');
  try {
    const res = await ncbiFetch('efetch.fcgi', { db: 'pmc', id, retmode: 'xml' });
    const sections = parseJatsSections(await res.text());
    return sections.length > 0 ? sections : null;
  } catch (err) {
    console.error(`PMC full text failed for ${pmcid}:`, err);
    return null;
  }
}

interface UnpaywallLocation {
  url_for_pdf?: string | null;
}
interface UnpaywallResponse {
  is_oa?: boolean;
  best_oa_location?: UnpaywallLocation | null;
  oa_locations?: UnpaywallLocation[];
}

/** Open-access PDF links Unpaywall knows for a DOI, best first. */
export async function unpaywallPdfUrls(doi: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const email = process.env.UNPAYWALL_EMAIL || process.env.NCBI_EMAIL;
  if (!email) return []; // Unpaywall requires a contact email
  try {
    const res = await fetchImpl(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as UnpaywallResponse;
    if (!data.is_oa) return [];
    const urls = [data.best_oa_location, ...(data.oa_locations ?? [])]
      .map((l) => l?.url_for_pdf)
      .filter((u): u is string => !!u && /^https:\/\//i.test(u));
    return [...new Set(urls)].slice(0, 3);
  } catch (err) {
    console.error(`Unpaywall lookup failed for ${doi}:`, err);
    return [];
  }
}

/** Downloads a PDF (size- and time-limited); null if it isn't one or fails. */
export async function downloadPdf(url: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: { Accept: 'application/pdf' },
    });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_PDF_BYTES) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    return bytes;
  } catch (err) {
    console.error(`PDF download failed (${url}):`, err);
    return null;
  }
}

export async function fetchUnpaywallSections(doi: string, fetchImpl: typeof fetch = fetch): Promise<ArticleSection[] | null> {
  for (const url of await unpaywallPdfUrls(doi, fetchImpl)) {
    const bytes = await downloadPdf(url, fetchImpl);
    if (!bytes) continue;
    try {
      return await pdfToSections(bytes);
    } catch {
      // Scanned or not really a PDF (often an HTML landing page): try the next link.
    }
  }
  return null;
}

export interface FullTextDeps {
  pmc?: typeof fetchPmcSections;
  unpaywall?: typeof fetchUnpaywallSections;
}

/** Free full text for an article: PMC, then Unpaywall. Null if neither has it. */
export async function findFreeFullText(
  ids: { pmcid: string | null; doi: string | null },
  deps: FullTextDeps = {}
): Promise<FullText | null> {
  const pmc = deps.pmc ?? fetchPmcSections;
  const unpaywall = deps.unpaywall ?? fetchUnpaywallSections;
  if (ids.pmcid) {
    const sections = await pmc(ids.pmcid);
    if (sections) return { source: 'pmc', sections };
  }
  if (ids.doi) {
    const sections = await unpaywall(ids.doi);
    if (sections) return { source: 'unpaywall', sections };
  }
  return null;
}
