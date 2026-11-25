// src/lib/articles/guide.ts
// Deep Read guide, built in two model calls. Server-side only.
//
//   1. articleFacts: facts from the full text, each with a verbatim excerpt from the
//      section it came from.
//   2. articleGuide: the reading map, stats decoder, appraisal, Q&A and quiz, written
//      from those facts only (not the raw text).
//
// [trust] Every excerpt must appear word for word in its section, and every number
// in a fact must appear in its section; facts that fail are dropped. Every number in
// the guide must appear in the article. Output that breaks this is retried once, then
// the offending sentences or items are removed.
import { z } from 'zod/v4';
import { getTaskModel, type ModelChoice } from '@/lib/ai/models';
import { generateStructured } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';
import { dropUngroundedSentences, isVerbatim, sourceNumberSet, ungroundedNumbers } from './grounding';
import { sectionsText, type ArticleSection } from './sections';
import {
  BIAS_RISKS,
  FACT_KINDS,
  STUDY_KIND_LABELS,
  type GuideBudget,
  type GuideContent,
  type GuideFact,
  type GuidePoint,
  type QuizItem,
  type StudyKind,
} from './types';

export class GuideGenerationError extends Error {
  status = 502;
  constructor(message: string) {
    super(message);
    this.name = 'GuideGenerationError';
  }
}

export interface GuideArticle {
  title: string;
  journal: string | null;
  year: number | null;
  studyKind: StudyKind;
  sections: ArticleSection[];
}

/** Careful reading speed used to size the map (words per minute). */
const WORDS_PER_MINUTE = 180;

const FACT_TARGET: Record<GuideBudget, string> = { 10: '10 to 15', 20: '15 to 25', 45: '25 to 40' };
const STEP_TARGET: Record<GuideBudget, string> = { 10: '2 to 4', 20: '3 to 6', 45: '5 to 9' };
const MIN_FACTS = 5;

// ---------------------------------------------------------------------------
// Step 1: facts

export const FactsSchema = z.object({
  facts: z.array(
    z.object({
      section_id: z.string().describe('id of the section the fact comes from, exactly as given'),
      kind: z.enum(FACT_KINDS),
      claim: z.string().describe('The fact in one plain sentence, using only numbers the section states'),
      excerpt: z
        .string()
        .describe('A short quote (one sentence or table row, under 300 characters) copied word for word from that section'),
    })
  ),
});
type FactsOutput = z.infer<typeof FactsSchema>;

const FACTS_SYSTEM = `You pull the key facts out of a journal article for a medical resident's reading guide.

The article is given as sections, each with an id. For each fact give:
- section_id: the id of the section it comes from.
- kind: design, population, intervention, outcome, result, safety, limitation or other.
- claim: the fact in one plain sentence.
- excerpt: a short quote copied word for word from that same section that shows the fact (one sentence or one table row; under 300 characters; no ellipses inside it).

Rules:
- The excerpt must be an exact copy of text in the cited section, character for character apart from spacing. It will be checked automatically, and facts whose excerpt doesn't match are thrown away.
- Every number in a claim must appear in the cited section. Do not calculate anything new.
- Cover what a reader needs to judge the paper: the question, design, who was studied, what was compared, the primary outcome and its result, key secondary and safety results, and the main limitations.
- Plain text only: no Markdown.`;

function sectionsPrompt(sections: ArticleSection[]): string {
  return sections.map((s) => `<section id="${s.id}" heading="${s.heading.replace(/"/g, "'")}">\n${s.text}\n</section>`).join('\n\n');
}

function articleHeader(article: GuideArticle): string {
  return [
    `Title: ${article.title}`,
    article.journal ? `Journal: ${article.journal}` : null,
    article.year ? `Year: ${article.year}` : null,
    `Study type: ${STUDY_KIND_LABELS[article.studyKind]}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Keeps the facts whose excerpt is verbatim in their section and whose numbers it contains. */
export function validateFacts(output: FactsOutput, sections: ArticleSection[]): { facts: GuideFact[]; removed: number } {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const facts: GuideFact[] = [];
  for (const f of output.facts) {
    const section = byId.get(f.section_id);
    if (!section) continue;
    const sectionText = `${section.heading}\n${section.text}`;
    if (!isVerbatim(f.excerpt, sectionText)) continue;
    if (ungroundedNumbers(f.claim, sectionText).length > 0) continue;
    facts.push({ id: `f${facts.length + 1}`, sectionId: section.id, kind: f.kind, claim: f.claim.trim(), excerpt: f.excerpt.trim() });
  }
  return { facts, removed: output.facts.length - facts.length };
}

export async function extractFacts(
  article: GuideArticle,
  budget: GuideBudget,
  calls: AiCallRecord[]
): Promise<{ facts: GuideFact[]; removed: number; model: string }> {
  const { fallback: _unused, ...choice } = getTaskModel('articleFacts');
  const user = `${articleHeader(article)}\n\nExtract ${FACT_TARGET[budget]} facts.\n\n${sectionsPrompt(article.sections)}`;

  let best: { facts: GuideFact[]; removed: number; model: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateStructured({
      task: 'articleFacts',
      choice,
      system: FACTS_SYSTEM,
      user,
      schema: FactsSchema,
      schemaName: 'article_facts',
    });
    if (!result.ok) {
      calls.push(result.record);
      if (result.failure === 'refusal') break;
      continue;
    }
    const checked = { ...validateFacts(result.data, article.sections), model: result.record.model };
    const enough = checked.facts.length >= MIN_FACTS;
    calls.push(
      enough ? result.record : { ...result.record, success: false, error: `only ${checked.facts.length} facts matched the text` }
    );
    if (!best || checked.facts.length > best.facts.length) best = checked;
    if (enough) break;
  }
  if (!best || best.facts.length < 3) {
    throw new GuideGenerationError("Couldn't pull enough checkable facts from this article's text to build a guide.");
  }
  return best;
}

// ---------------------------------------------------------------------------
// Step 2: the guide

const factRef = z.array(z.string()).describe('ids of the facts this is based on, e.g. ["f3", "f7"]');

export const GuideSchema = z.object({
  steps: z.array(
    z.object({
      section_id: z.string().describe('id of the section to read'),
      title: z.string().describe('Short name for this stop, e.g. "Who was enrolled"'),
      minutes: z.number().int().describe('Minutes to spend here'),
      look_for: z.string().describe('What to look for or question while reading this section, in one or two sentences'),
      fact_ids: factRef,
    })
  ),
  stats: z.array(
    z.object({
      label: z.string().describe('What the number is, e.g. "Primary outcome, hazard ratio"'),
      value: z.string().describe('The number(s) exactly as the facts state them, e.g. "0.75 (95% CI 0.59-0.95)"'),
      meaning: z.string().describe('What it means in plain words, one sentence'),
      fact_id: z.string().describe('id of the fact the value comes from'),
    })
  ),
  strengths: z.array(z.object({ text: z.string(), fact_ids: factRef })),
  weaknesses: z.array(z.object({ text: z.string(), fact_ids: factRef })),
  bias_risk: z.enum(BIAS_RISKS).describe('Overall risk of bias: low, some_concerns or high'),
  bias_reason: z.string().describe('One sentence on why'),
  qa: z.array(z.object({ question: z.string(), answer: z.string(), fact_ids: factRef })),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe('Exactly 4 answer options'),
      answer_index: z.number().int().describe('Index (0-3) of the correct option'),
      explanation: z.string().describe('Why that answer is right, one or two sentences'),
      fact_id: z.string().describe('id of the fact the answer comes from'),
    })
  ),
});
export type GuideOutput = z.infer<typeof GuideSchema>;

function guideSystem(budget: GuideBudget): string {
  return `You write reading guides that help a medical resident get the most out of a journal article in ${budget} minutes.

You get the article's sections (id, heading, length) and facts already checked against the text (id, section, claim, excerpt). Write the guide from these facts only.

Write:
- steps: a reading map of ${STEP_TARGET[budget]} stops in reading order. Each names one section to read, a short title, the minutes to spend (all steps together about ${budget} minutes; use the section lengths), what to look for, and the facts it covers. Lead with what matters most: for a trial, usually the methods' design and population, the primary result and its table, then the limitations in the discussion. Skip what the reader doesn't need.
- stats: up to 8 key numbers (effect sizes, event rates, confidence intervals, sample size, follow-up), each with its value exactly as a fact states it and what it means in plain words.
- strengths and weaknesses: 2 to 4 each, about the design, conduct and reporting.
- bias_risk and bias_reason: an overall judgement.
- qa: 3 to 6 questions a resident might be asked about this paper on rounds, with short answers.
- quiz: exactly 5 multiple-choice questions to check understanding, each with 4 options, the index of the right one, a short explanation and the fact it rests on.

Rules:
- Use only the facts given. Every number you write must appear in a fact exactly (the only exception: the wrong options of a quiz question). Do not calculate anything new (no NNTs, absolute differences or percentages the facts don't state).
- Refer to facts and sections only by the ids given.
- Plain text only: no Markdown.`;
}

function guidePrompt(article: GuideArticle, facts: GuideFact[]): string {
  const sections = article.sections
    .map((s) => {
      const words = s.text.split(/\s+/).length;
      return `- ${s.id}: ${s.heading} (${words} words, about ${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min)`;
    })
    .join('\n');
  const factLines = facts
    .map((f) => `<fact id="${f.id}" section="${f.sectionId}" kind="${f.kind}">\nclaim: ${f.claim}\nexcerpt: ${f.excerpt}\n</fact>`)
    .join('\n');
  return `${articleHeader(article)}\n\nSections:\n${sections}\n\nFacts:\n${factLines}`;
}

/** Every number in the guide's text that the article doesn't contain. */
export function guideUngroundedNumbers(output: GuideOutput, allowed: Set<string>): string[] {
  const texts = [
    ...output.steps.flatMap((s) => [s.title, s.look_for]),
    ...output.stats.flatMap((s) => [s.label, s.value, s.meaning]),
    ...output.strengths.map((p) => p.text),
    ...output.weaknesses.map((p) => p.text),
    output.bias_reason,
    ...output.qa.flatMap((q) => [q.question, q.answer]),
    // Wrong options are meant to be wrong, so only the right one is checked.
    ...output.quiz.flatMap((q) => [q.question, q.options[q.answer_index] ?? '', q.explanation]),
  ];
  return texts.flatMap((t) => ungroundedNumbers(t, allowed));
}

/** Turns model output into the stored guide, removing anything that doesn't check out. */
export function cleanGuide(
  output: GuideOutput,
  facts: GuideFact[],
  sections: ArticleSection[],
  allowed: Set<string>
): GuideContent {
  let removed = 0;
  const factIds = new Set(facts.map((f) => f.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const refs = (ids: string[]) => ids.filter((id) => factIds.has(id));
  const ref = (id: string) => (factIds.has(id) ? id : null);
  const grounded = (text: string) => ungroundedNumbers(text, allowed).length === 0;
  const clean = (text: string) => {
    const r = dropUngroundedSentences(text, allowed);
    removed += r.dropped;
    return r.text;
  };
  const keep = <T>(items: T[], ok: (item: T) => boolean): T[] => {
    const kept = items.filter(ok);
    removed += items.length - kept.length;
    return kept;
  };

  const steps = keep(
    output.steps.map((s) => ({
      sectionId: s.section_id,
      title: s.title.trim(),
      minutes: Math.min(60, Math.max(1, Math.round(s.minutes))),
      lookFor: clean(s.look_for),
      factIds: refs(s.fact_ids),
    })),
    (s) => sectionIds.has(s.sectionId) && !!s.lookFor && grounded(s.title)
  );

  const stats = keep(
    output.stats.map((s) => ({ label: s.label.trim(), value: s.value.trim(), meaning: clean(s.meaning), factId: ref(s.fact_id) })),
    (s) => !!s.meaning && !!s.value && grounded(s.value) && grounded(s.label)
  );

  const points = (items: GuideOutput['strengths']): GuidePoint[] =>
    keep(
      items.map((p) => ({ text: clean(p.text), factIds: refs(p.fact_ids) })),
      (p) => !!p.text
    );

  const qa = keep(
    output.qa.map((q) => ({ question: q.question.trim(), answer: clean(q.answer), factIds: refs(q.fact_ids) })),
    (q) => !!q.answer && grounded(q.question)
  );

  const quiz: QuizItem[] = keep(
    output.quiz.map((q) => ({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      answerIndex: q.answer_index,
      explanation: q.explanation.trim(),
      factId: ref(q.fact_id),
    })),
    (q) =>
      q.options.length >= 2 &&
      q.options.length <= 6 &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex < q.options.length &&
      [q.question, q.explanation, q.options[q.answerIndex]].every(grounded)
  ).slice(0, 5);

  return {
    steps,
    stats,
    appraisal: {
      strengths: points(output.strengths),
      weaknesses: points(output.weaknesses),
      biasRisk: output.bias_risk,
      biasReason: clean(output.bias_reason),
    },
    qa,
    quiz,
    removed,
  };
}

export async function writeGuide(
  article: GuideArticle,
  facts: GuideFact[],
  budget: GuideBudget,
  calls: AiCallRecord[]
): Promise<{ guide: GuideContent; model: string }> {
  const { fallback: _unused, ...choice } = getTaskModel('articleGuide');
  const allowed = sourceNumberSet(`${article.title}\n${sectionsText(article.sections)}`);

  let last: { output: GuideOutput; model: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateStructured({
      task: 'articleGuide',
      choice: choice as ModelChoice,
      system: guideSystem(budget),
      user: guidePrompt(article, facts),
      schema: GuideSchema,
      schemaName: 'article_guide',
    });
    if (!result.ok) {
      calls.push(result.record);
      if (result.failure === 'refusal') break;
      continue;
    }
    last = { output: result.data, model: result.record.model };
    const bad = guideUngroundedNumbers(result.data, allowed);
    if (bad.length === 0) {
      calls.push(result.record);
      break;
    }
    calls.push({ ...result.record, success: false, error: `numbers not in article: ${[...new Set(bad)].join(', ')}` });
  }
  if (!last) throw new GuideGenerationError("Couldn't write the guide. Please try again.");

  const guide = cleanGuide(last.output, facts, article.sections, allowed);
  if (guide.steps.length === 0) throw new GuideGenerationError("Couldn't write a reading map for this article. Please try again.");
  return { guide, model: last.model };
}

/** Both steps. Every model call is appended to `calls`, also when this throws. */
export async function buildGuide(
  article: GuideArticle,
  budget: GuideBudget,
  calls: AiCallRecord[] = []
): Promise<{ facts: GuideFact[]; guide: GuideContent; model: string }> {
  const facts = await extractFacts(article, budget, calls);
  const { guide, model } = await writeGuide(article, facts.facts, budget, calls);
  return { facts: facts.facts, guide: { ...guide, removed: guide.removed + facts.removed }, model };
}
