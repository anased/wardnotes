// src/lib/articles/types.ts
// Deep Read records (see migrations/add_article_reads.sql). Client-safe.
import type { ArticleSection } from './sections';

export const STUDY_KINDS = ['rct', 'trial', 'meta_analysis', 'cohort', 'review', 'guideline', 'case', 'other'] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export const STUDY_KIND_LABELS: Record<StudyKind, string> = {
  rct: 'RCT',
  trial: 'Clinical trial',
  meta_analysis: 'Meta-analysis',
  cohort: 'Observational',
  review: 'Review',
  guideline: 'Guideline',
  case: 'Case report',
  other: 'Article',
};

export const READ_STATUSES = ['to_read', 'reading', 'done', 'skipped'] as const;
export type ReadStatus = (typeof READ_STATUSES)[number];

export const READ_STATUS_LABELS: Record<ReadStatus, string> = {
  to_read: 'To read',
  reading: 'Reading',
  done: 'Done',
  skipped: 'Skipped',
};

export type FullTextSource = 'none' | 'pmc' | 'unpaywall' | 'pdf';

export const VERDICTS = ['read', 'skim', 'skip'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Primer {
  /** The question the paper sets out to answer. */
  question: string;
  /** What it found, in one or two sentences. */
  bottomLine: string;
  verdict: Verdict;
  /** One short sentence on why. */
  verdictReason: string;
  /** Minutes the recommended approach takes (0 for skip). */
  minutes: number;
  /** Built from the abstract only (always true until full text arrives in phase 2). */
  abstractOnly: boolean;
  /** Sentences removed because they held a number not found in the source. */
  droppedSentences: number;
  /** Model that wrote it. */
  model: string;
  createdAt: string;
}

/** The PubMed facts every user's copy of an article shares. */
export interface ArticleMetadata {
  pmid: string;
  doi: string | null;
  pmcid: string | null;
  title: string;
  journal: string | null;
  year: number | null;
  abstract: string;
  publicationTypes: string[];
}

export interface ArticleRead {
  id: string;
  user_id: string;
  pmid: string | null;
  doi: string | null;
  pmcid: string | null;
  title: string;
  journal: string | null;
  year: number | null;
  abstract: string | null;
  publication_types: string[];
  study_kind: StudyKind;
  full_text_source: FullTextSource;
  pdf_path: string | null;
  status: ReadStatus;
  primer: Primer | null;
  /** Full text split into sections (phase 2); null until found or uploaded. Not loaded in lists. */
  sections?: ArticleSection[] | null;
  progress: Record<string, unknown> | null;
  note_id: string | null;
  trial_id: string | null;
  created_at: string;
  updated_at: string;
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

// ---------------------------------------------------------------------------
// Guides (phase 2)

export const GUIDE_BUDGETS = [10, 20, 45] as const;
export type GuideBudget = (typeof GUIDE_BUDGETS)[number];

export const FACT_KINDS = ['design', 'population', 'intervention', 'outcome', 'result', 'safety', 'limitation', 'other'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** One fact from the article, with a verbatim excerpt from the section it came from. */
export interface GuideFact {
  id: string;
  sectionId: string;
  kind: FactKind;
  claim: string;
  excerpt: string;
}

/** One stop on the reading map. */
export interface GuideStep {
  sectionId: string;
  title: string;
  minutes: number;
  lookFor: string;
  factIds: string[];
}

export interface GuideStat {
  label: string;
  value: string;
  meaning: string;
  factId: string | null;
}

export interface GuidePoint {
  text: string;
  factIds: string[];
}

export const BIAS_RISKS = ['low', 'some_concerns', 'high'] as const;
export type BiasRisk = (typeof BIAS_RISKS)[number];

export interface GuideAppraisal {
  strengths: GuidePoint[];
  weaknesses: GuidePoint[];
  biasRisk: BiasRisk;
  biasReason: string;
}

export interface GuideQA {
  question: string;
  answer: string;
  factIds: string[];
}

export interface QuizItem {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  factId: string | null;
}

export interface GuideContent {
  steps: GuideStep[];
  stats: GuideStat[];
  appraisal: GuideAppraisal;
  qa: GuideQA[];
  quiz: QuizItem[];
  /** Facts, sentences or items removed because a number or excerpt didn't match the article. */
  removed: number;
}

/** A row of article_guides. */
export interface ArticleGuide {
  id: string;
  article_read_id: string;
  user_id: string;
  budget_minutes: GuideBudget;
  sections: ArticleSection[];
  facts: GuideFact[];
  guide: GuideContent;
  model: string | null;
  created_at: string;
}
