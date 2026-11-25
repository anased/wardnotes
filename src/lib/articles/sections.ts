// src/lib/articles/sections.ts
// Split an article's full text into sections with stable IDs, from PubMed Central
// JATS XML or from text extracted from a PDF. Pure; no fetching.
//
// IDs: "abstract", then body sections s1, s2, … (nested: s2.1, s2.2), PMC tables
// t1, t2, …; PDFs without recognisable headings fall back to pages p1, p2, ….
// The guide, its excerpts and the reader's progress refer to these IDs.
import { decodeEntities } from '@/lib/trials/pubmed';

export interface ArticleSection {
  id: string;
  heading: string;
  text: string;
}

/** Full text kept per article; longer articles are cut (references are dropped first anyway). */
export const MAX_FULL_TEXT_CHARS = 150_000;

// ---------------------------------------------------------------------------
// PubMed Central (JATS XML)

function clean(line: string): string {
  return decodeEntities(line.replace(/<[^>]+>/g, ''))
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Readable text of a JATS fragment: one line per paragraph, table row or caption. */
function jatsText(fragment: string): string {
  const withBreaks = fragment
    // Citation markers ("[12]") would add numbers the article never states as data.
    .replace(/<xref\b[^>]*ref-type="(?:bibr|fn|table-fn)"[^>]*>[\s\S]*?<\/xref>/g, '')
    .replace(/<(?:supplementary-material|ref-list|fn-group|table-wrap-foot)\b[\s\S]*?<\/(?:supplementary-material|ref-list|fn-group|table-wrap-foot)>/g, '')
    .replace(/<\/(?:th|td)>/g, ' | ')
    .replace(/<\/(?:p|tr|title|label|caption|list-item|disp-quote)>/g, '\n');
  return withBreaks
    .split('\n')
    .map((l) => clean(l).replace(/\s*\|\s*$/, '').replace(/^\|\s*/, ''))
    .filter(Boolean)
    .join('\n');
}

interface SecNode {
  start: number; // index after the opening tag
  end: number; // index of the closing tag
  children: SecNode[];
}

/** Top-level <sec> elements (with nested children) of a fragment. */
function secTree(xml: string): SecNode[] {
  const roots: SecNode[] = [];
  const stack: SecNode[] = [];
  for (const m of xml.matchAll(/<sec\b[^>]*>|<\/sec>/g)) {
    if (m[0].startsWith('</')) {
      const node = stack.pop();
      if (node) node.end = m.index!;
    } else {
      const node: SecNode = { start: m.index! + m[0].length, end: xml.length, children: [] };
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      stack.push(node);
    }
  }
  return roots;
}

/** A section's own content: its text with nested sections cut out. */
function ownContent(xml: string, node: SecNode): string {
  let out = '';
  let pos = node.start;
  for (const child of node.children) {
    out += xml.slice(pos, child.start);
    pos = child.end;
  }
  return out + xml.slice(pos, node.end);
}

function pushSections(xml: string, nodes: SecNode[], prefix: string, out: ArticleSection[]) {
  nodes.forEach((node, i) => {
    const id = `${prefix}${i + 1}`;
    const own = ownContent(xml, node);
    const titleXml = own.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const heading = titleXml ? clean(titleXml) : '';
    if (/^supplementary/i.test(heading)) return;
    const text = jatsText(titleXml ? own.replace(/<title>[\s\S]*?<\/title>/, '') : own);
    if (text) out.push({ id, heading: heading || 'Section', text });
    pushSections(xml, node.children, `${id}.`, out);
  });
}

/**
 * Sections of a PMC article: abstract, body sections, then tables printed at the end
 * (<floats-group>). Returns [] when PMC withholds the body (publisher restriction).
 */
export function parseJatsSections(xml: string): ArticleSection[] {
  const sections: ArticleSection[] = [];

  const abstractXml = xml.match(/<abstract(?![^>]*abstract-type="(?:graphical|teaser|toc)")[^>]*>([\s\S]*?)<\/abstract>/)?.[1];
  if (abstractXml) {
    const text = jatsText(abstractXml.replace(/<title>[\s\S]*?<\/title>/g, (t) => `${t.replace(/<\/?title>/g, '')}: `));
    if (text) sections.push({ id: 'abstract', heading: 'Abstract', text });
  }

  const body = xml.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  if (!body) return [];
  const tree = secTree(body);
  // Paragraphs before the first <sec> (some articles have no sections at all).
  const firstSec = body.search(/<sec\b/);
  const lead = jatsText(firstSec === -1 ? body : body.slice(0, firstSec));
  if (lead) sections.push({ id: 's0', heading: tree.length ? 'Introduction' : 'Text', text: lead });
  pushSections(body, tree, 's', sections);

  const floats = xml.match(/<floats-group>([\s\S]*?)<\/floats-group>/)?.[1] ?? '';
  let t = 0;
  for (const m of floats.matchAll(/<table-wrap\b[^>]*>([\s\S]*?)<\/table-wrap>/g)) {
    const label = clean(m[1].match(/<label>([\s\S]*?)<\/label>/)?.[1] ?? '');
    const caption = clean(m[1].match(/<caption>([\s\S]*?)<\/caption>/)?.[1] ?? '');
    const text = jatsText(m[1].replace(/<label>[\s\S]*?<\/label>/, ''));
    if (text) sections.push({ id: `t${++t}`, heading: [label, caption].filter(Boolean).join(' ') || 'Table', text });
  }

  const hasBody = sections.some((s) => s.id !== 'abstract');
  return hasBody ? capSections(sections) : [];
}

// ---------------------------------------------------------------------------
// PDF text

const HEADING_RE =
  /^(?:\d{1,2}(?:\.\d{1,2})*\.?\s+)?(abstract|summary|background|introduction|methods?|materials and methods|patients and methods|study design|results|findings|discussion|comment|conclusions?|interpretation|limitations|strengths and limitations|research in context|references|bibliography|acknowledg(?:e)?ments?|funding|disclosures?|supplementary (?:material|appendix))\s*:?$/i;
const SKIP_HEADING_RE = /^(acknowledg|funding|disclosure|supplementary)/i;
const STOP_HEADING_RE = /^(references|bibliography)$/i;

/** Joins a block of PDF lines into one paragraph, keeping hyphens at line ends. */
function joinLines(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/(\w)- (?=\w)/g, '$1-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines repeated on most pages (running heads, journal footers). */
function repeatedLines(pages: string[][]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page.map((l) => l.trim()).filter((l) => l.length > 0 && l.length < 120))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.6));
  return new Set([...counts].filter(([, n]) => n >= min).map(([line]) => line));
}

/** Characters of real text, ignoring whitespace. */
export function textLength(pages: string[]): number {
  return pages.reduce((n, p) => n + p.replace(/\s/g, '').length, 0);
}

/**
 * Sections from per-page PDF text: split at common headings (Abstract, Methods,
 * Results, …), dropping references, acknowledgements and funding. Falls back to one
 * section per page when fewer than two headings are found.
 */
export function splitPdfSections(pageTexts: string[]): ArticleSection[] {
  const pages = pageTexts.map((p) => p.split('\n'));
  const repeated = repeatedLines(pages);
  const lines = pages.flatMap((p) => p).filter((l) => {
    const t = l.trim();
    return t && !repeated.has(t) && !/^\d{1,4}$/.test(t);
  });

  const blocks: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  for (const line of lines) {
    const t = line.trim();
    const m = t.length <= 60 ? t.match(HEADING_RE) : null;
    if (m) blocks.push({ heading: m[1], lines: [] });
    else blocks[blocks.length - 1].lines.push(t);
  }

  const headings = blocks.filter((b) => b.heading);
  if (headings.length < 2) {
    const byPage = pageTexts
      .map((p, i) => ({ id: `p${i + 1}`, heading: `Page ${i + 1}`, text: joinLines(p.split('\n')) }))
      .filter((s) => s.text);
    return capSections(byPage);
  }

  const sections: ArticleSection[] = [];
  let n = 0;
  for (const block of blocks) {
    if (block.heading && STOP_HEADING_RE.test(block.heading)) break;
    if (block.heading && SKIP_HEADING_RE.test(block.heading)) continue;
    const text = joinLines(block.lines);
    if (!text) continue;
    const heading = block.heading
      ? block.heading.charAt(0).toUpperCase() + block.heading.slice(1).toLowerCase()
      : 'Opening';
    sections.push({ id: block.heading ? `s${++n}` : 's0', heading, text });
  }
  return capSections(sections);
}

/** Keeps sections whole until the character budget runs out, then cuts the last one. */
export function capSections(sections: ArticleSection[], max = MAX_FULL_TEXT_CHARS): ArticleSection[] {
  const out: ArticleSection[] = [];
  let used = 0;
  for (const s of sections) {
    if (used >= max) break;
    const room = max - used;
    out.push(s.text.length > room ? { ...s, text: s.text.slice(0, room) } : s);
    used += Math.min(s.text.length, room);
  }
  return out;
}

/** All section text, for checking that numbers in the guide come from the article. */
export function sectionsText(sections: ArticleSection[]): string {
  return sections.map((s) => `${s.heading}\n${s.text}`).join('\n\n');
}
