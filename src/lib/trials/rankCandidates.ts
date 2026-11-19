// src/lib/trials/rankCandidates.ts
// Merge and rank trial-publication candidates from PubMed and ClinicalTrials.gov.
// Pure functions (no I/O) so the ranking is unit-testable. Client-safe.
//
// Priority, highest first:
//   1. names the trial: the acronym is in the title, OR the paper is linked to a
//      registry study with exactly that acronym (PubMed [si] / registry results
//      reference), OR it's authored by that trial's investigator group ([cn]).
//      Many primary results papers don't put the acronym in the title (POINT,
//      THALES, INSPIRES, CHANCE-2 in NEJM), so the title alone isn't enough.
//   2. publication type Randomized Controlled Trial (> Clinical Trial)
//   3. primary results, not a secondary analysis / comment / editorial / protocol /
//      review. Positive signal: editorials and letters PubMed links as "Comment in"
//      (primary papers draw them; sub-analyses rarely do).
//   4. journal prominence
//   5. recency, then PubMed's own relevance order

export interface CandidateInput {
  pmid: string;
  title: string;
  journal: string | null;
  journalAbbrev: string | null;
  year: number | null;
  firstAuthor: string | null;
  doi: string | null;
  pubTypes: string[];
  /** Number of "Comment in" links in PubMed. */
  commentCount: number;
  /** Position in the PubMed name search (0 = most relevant), or null if not found there. */
  pubmedRank: number | null;
  /** Found by searching the trial name as corporate author ("<name> Investigators"). */
  corporateAuthor: boolean;
  /** NCT IDs of matching registry studies this paper is linked to (via PubMed [si] or registry references). */
  nctIds: string[];
  /** PubMed indexes one of those NCT IDs on this paper (secondary source ID). */
  registryLinked: boolean;
  /** The registry lists this PMID as a results publication (investigator-entered; weaker). */
  registryResult: boolean;
}

export type AcronymMatch = 'title' | 'registry' | 'author' | null;

export interface TrialCandidate {
  pmid: string;
  title: string;
  journal: string | null;
  journalAbbrev: string | null;
  year: number | null;
  firstAuthor: string | null;
  doi: string | null;
  isRct: boolean;
  nctIds: string[];
  acronymMatch: AcronymMatch;
  /** Looks like a secondary publication (sub-analysis, comment, protocol…). */
  secondary: boolean;
  score: number;
}

const SECONDARY_PUBTYPES = new Set(
  [
    'Comment',
    'Editorial',
    'Letter',
    'Review',
    'Systematic Review',
    'Meta-Analysis',
    'Published Erratum',
    'Retraction Notice',
    'Clinical Trial Protocol',
    'News',
    'Case Reports',
  ].map((t) => t.toLowerCase())
);

const SECONDARY_TITLE =
  /\b(secondary analys[ie]s|post[- ]?hoc|sub-?analys[ie]s|sub-?stud(y|ies)|subgroup|pre-?specified|exploratory analys[ie]s|ancillary|rationale|design and|study design|protocol|baseline characteristics|statistical analysis plan|cost[- ]effectiveness|economic evaluation|long[- ]term (follow[- ]up|outcomes)|extended follow[- ]up|lessons learned|a (re)?analysis of|insights from|(in|from) the ([\p{L}\p{N}.-]+ ){1,4}(trial|study|randomi[sz]ed)|erratum|correction|retraction|commentary|reply)\b/iu;

const TOP_JOURNALS = new Set(['n engl j med', 'lancet', 'jama', 'bmj']);
const HIGH_JOURNALS = new Set([
  'lancet neurol',
  'jama neurol',
  'stroke',
  'circulation',
  'eur heart j',
  'j am coll cardiol',
  'ann intern med',
  'nat med',
  'jama intern med',
  'lancet infect dis',
  'lancet oncol',
  'j clin oncol',
  'neurology',
  'int j stroke',
  'lancet respir med',
  'am j respir crit care med',
  'intensive care med',
  'jama cardiol',
  'lancet diabetes endocrinol',
  'gastroenterology',
  'gut',
  'kidney int',
  'j am soc nephrol',
]);

export const RANK_WEIGHTS = {
  namesTrial: 100,
  registryResult: 15,
  rct: 40,
  clinicalTrial: 20,
  secondary: -80,
  perComment: 15,
  maxComments: 3,
  topJournal: 25,
  highJournal: 10,
  recencyMax: 5,
  pubmedRankMax: 6,
};
const W = RANK_WEIGHTS;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does the title name the trial? Matches the query as a whole token, tolerant of
 * hyphen/space/dot differences ("CHANCE-2" ~ "CHANCE 2"). Acronyms are written in
 * capitals, so the matched text must be all upper-case ("POINT", not the title-case
 * "Point-of-Care"), or mixed-case with 2+ capitals ("CSPS.com").
 */
export function titleMentionsAcronym(title: string, query: string): boolean {
  const parts = query
    .trim()
    .split(/[-\s.]+/)
    .filter(Boolean)
    .map(escapeRegex);
  if (parts.length === 0) return false;
  // Not followed by another letter/digit, nor by "-2"/".2"/" 2" (CHANCE vs CHANCE-2).
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${parts.join('[-\\s.]?')}(?![\\p{L}\\p{N}]|[-.][\\p{L}\\p{N}]|\\s\\d)`,
    'giu'
  );
  for (const m of title.matchAll(re)) {
    const text = m[0];
    if (!/\p{L}/u.test(text)) return true; // purely numeric names
    if (text === text.toUpperCase()) return true;
    if ((text.match(/\p{Lu}/gu) ?? []).length >= 2) return true;
  }
  return false;
}

export function isSecondary(title: string, pubTypes: string[]): boolean {
  if (pubTypes.some((t) => SECONDARY_PUBTYPES.has(t.toLowerCase()))) return true;
  return SECONDARY_TITLE.test(title);
}

function journalScore(abbrev: string | null): number {
  const j = (abbrev ?? '').toLowerCase().replace(/\./g, '').trim();
  if (TOP_JOURNALS.has(j)) return W.topJournal;
  if (HIGH_JOURNALS.has(j)) return W.highJournal;
  return 0;
}

export function scoreCandidate(c: CandidateInput, query: string, now = new Date().getFullYear()): TrialCandidate {
  const pubTypes = c.pubTypes.map((t) => t.toLowerCase());
  // Title wording covers recent papers PubMed hasn't indexed with publication types yet.
  const isRct =
    pubTypes.includes('randomized controlled trial') ||
    /\brandomi[sz]ed,? (controlled |clinical |placebo-controlled |double-blind |open-label |multicent(er|re) |non-?inferiority |phase (2|3|ii|iii) )*trial\b/i.test(c.title);
  const isTrial = isRct || pubTypes.some((t) => t.startsWith('clinical trial') && t !== 'clinical trial protocol');
  const secondary = isSecondary(c.title, c.pubTypes);
  const inTitle = query ? titleMentionsAcronym(c.title, query) : false;
  const acronymMatch: AcronymMatch = inTitle
    ? 'title'
    : c.registryLinked
      ? 'registry'
      : c.corporateAuthor
        ? 'author'
        : null;

  let score = 0;
  if (acronymMatch) score += W.namesTrial;
  if (c.registryResult) score += W.registryResult;
  score += isRct ? W.rct : isTrial ? W.clinicalTrial : 0;
  if (secondary) score += W.secondary;
  else score += Math.min(c.commentCount, W.maxComments) * W.perComment;
  score += journalScore(c.journalAbbrev);
  if (c.year) score += Math.min(Math.max((c.year - 1980) / (now - 1980), 0), 1) * W.recencyMax;
  if (c.pubmedRank !== null) score += Math.max(0, W.pubmedRankMax - c.pubmedRank * 0.6);

  return {
    pmid: c.pmid,
    title: c.title,
    journal: c.journal,
    journalAbbrev: c.journalAbbrev,
    year: c.year,
    firstAuthor: c.firstAuthor,
    doi: c.doi,
    isRct,
    nctIds: c.nctIds,
    acronymMatch,
    secondary,
    score: Math.round(score * 10) / 10,
  };
}

/** Score, dedupe by PMID (merging registry links), and sort best first. */
export function rankCandidates(inputs: CandidateInput[], query: string, now?: number): TrialCandidate[] {
  const byPmid = new Map<string, CandidateInput>();
  for (const c of inputs) {
    const prev = byPmid.get(c.pmid);
    if (!prev) {
      byPmid.set(c.pmid, { ...c, nctIds: [...c.nctIds] });
      continue;
    }
    prev.nctIds = [...new Set([...prev.nctIds, ...c.nctIds])];
    prev.registryResult ||= c.registryResult;
    prev.registryLinked ||= c.registryLinked;
    prev.corporateAuthor ||= c.corporateAuthor;
    if (c.pubmedRank !== null && (prev.pubmedRank === null || c.pubmedRank < prev.pubmedRank)) {
      prev.pubmedRank = c.pubmedRank;
    }
  }
  return [...byPmid.values()]
    .map((c) => scoreCandidate(c, query, now))
    .sort((a, b) => b.score - a.score || (b.year ?? 0) - (a.year ?? 0));
}
