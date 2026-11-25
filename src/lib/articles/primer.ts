// src/lib/articles/primer.ts
// Deep Read primer: the question, the bottom line and a read / skim / skip verdict,
// from an article's abstract. Server-side only.
//
// Model routing comes from lib/ai/models (task `articlePrimer`: cheap model first,
// stronger fallback). [trust] Every number in the primer must appear in the source;
// output that breaks this is treated like invalid output (retry, then fallback), and
// if no model gets it right, the offending sentences are removed.
import { z } from 'zod/v4';
import { getTaskModel, type ModelChoice, type TaskModelConfig } from '@/lib/ai/models';
import { generateStructured, type StructuredResult } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';
import { dropUngroundedSentences, sourceNumberSet, ungroundedNumbers } from './grounding';
import type { ArticleMetadata, Primer } from './types';

/** Bump when the prompt or schema changes, so cached primers are rebuilt. */
export const PRIMER_PROMPT_VERSION = 'primer-v1';

/** Cache key part: prompt version plus the configured primary model. */
export function primerVersion(config: TaskModelConfig = getTaskModel('articlePrimer')): string {
  return `${PRIMER_PROMPT_VERSION}:${config.provider}:${config.model}`;
}

export const PrimerSchema = z.object({
  question: z
    .string()
    .describe('The question the study set out to answer, as one plain sentence ending in a question mark'),
  bottom_line: z
    .string()
    .describe('What the study found and what it means, in one or two short sentences, with the key numbers'),
  verdict: z
    .enum(['read', 'skim', 'skip'])
    .describe('read: worth reading in full; skim: read the key parts only; skip: the abstract is enough'),
  verdict_reason: z.string().describe('One short sentence on why, for a resident deciding how to spend their time'),
  minutes: z
    .number()
    .int()
    .min(0)
    .max(120)
    .describe('Minutes the recommended approach takes: a full read (often 20-40), a skim (often 5-15), or 0 for skip'),
});

export type PrimerOutput = z.infer<typeof PrimerSchema>;

const SYSTEM_PROMPT = `You write short primers that help medical residents decide whether, and how, to read a journal article.

From the article details the user provides, write:
- question: what the study set out to answer, as one plain sentence.
- bottom_line: what it found and what that means, in one or two short sentences, with the key numbers.
- verdict and verdict_reason: whether a resident should read it in full, skim it, or skip it (the abstract is enough), and why in one short sentence.
- minutes: how long the recommended approach takes.

How to choose the verdict:
- read: a large or well-designed study (e.g. a major RCT, meta-analysis or guideline) whose findings could change practice, or a paper whose methods matter for interpreting it.
- skim: useful but incremental, or only part of it matters (e.g. one table, the primary outcome, the safety data).
- skip: the abstract tells the whole story, or the design is too weak to act on.

Rules:
- Use only what the source says. Do not add facts from memory, even if you recognise the study.
- Every number you write must appear in the source exactly. Do not calculate anything new (no absolute risk reductions, NNTs, percentages or averages the source doesn't state). If a number isn't in the source, describe the finding in words instead.
- Plain text only: no Markdown, no bullet points.
- Write like a clinician's note: compact and concrete.`;

/** Everything the model sees; also the text its numbers are checked against. */
export function buildPrimerSource(article: Pick<ArticleMetadata, 'title' | 'journal' | 'year' | 'abstract' | 'publicationTypes'>): string {
  return [
    `Title: ${article.title}`,
    article.journal ? `Journal: ${article.journal}` : null,
    article.year ? `Publication year: ${article.year}` : null,
    article.publicationTypes.length ? `Publication types: ${article.publicationTypes.join(', ')}` : null,
    '',
    article.abstract,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export interface PrimerResult {
  primer: Primer;
  servedBy: ModelChoice;
}

/** The numbers in the primer's text fields that the source doesn't contain. */
export function primerUngroundedNumbers(output: PrimerOutput, allowed: Set<string>): string[] {
  return [output.question, output.bottom_line, output.verdict_reason].flatMap((t) => ungroundedNumbers(t, allowed));
}

const NO_GROUNDED_BOTTOM_LINE = "The results couldn't be summarised reliably. Read the abstract's results.";

function toPrimer(output: PrimerOutput, model: string, allowed: Set<string>): Primer {
  let dropped = 0;
  const clean = (text: string) => {
    const result = dropUngroundedSentences(text, allowed);
    dropped += result.dropped;
    return result.text;
  };
  const question = clean(output.question);
  const bottomLine = clean(output.bottom_line) || NO_GROUNDED_BOTTOM_LINE;
  const verdictReason = clean(output.verdict_reason);
  return {
    question,
    bottomLine,
    verdict: output.verdict,
    verdictReason,
    minutes: output.verdict === 'skip' ? 0 : output.minutes,
    abstractOnly: true,
    droppedSentences: dropped,
    model,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Write a primer with the configured model chain:
 *   1. primary (cheap) model
 *   2. on invalid, truncated or ungrounded output: the same model once more
 *   3. then the fallback (stronger) model
 * A refusal skips the retry. If every valid output had numbers not in the source,
 * the last one is used with those sentences removed.
 *
 * Every call made is appended to `calls` (also when this throws).
 */
export async function generatePrimer(
  article: Pick<ArticleMetadata, 'title' | 'journal' | 'year' | 'abstract' | 'publicationTypes'>,
  calls: AiCallRecord[] = [],
  config: TaskModelConfig = getTaskModel('articlePrimer')
): Promise<PrimerResult> {
  const { fallback, ...primary } = config;
  const source = buildPrimerSource(article);
  const allowed = sourceNumberSet(source);
  const user = `<source>\n${source}\n</source>`;

  let lastValid: { output: PrimerOutput; choice: ModelChoice; model: string } | null = null;
  let lastError: Error | null = null;

  /** One attempt; returns 'done' with a grounded primer, or why it failed. */
  const attempt = async (choice: ModelChoice): Promise<PrimerResult | 'refusal' | 'failed'> => {
    const result: StructuredResult<PrimerOutput> = await generateStructured({
      task: 'articlePrimer',
      choice,
      system: SYSTEM_PROMPT,
      user,
      schema: PrimerSchema,
      schemaName: 'article_primer',
    });
    if (!result.ok) {
      calls.push(result.record);
      lastError = result.error;
      return result.failure === 'refusal' ? 'refusal' : 'failed';
    }
    const bad = primerUngroundedNumbers(result.data, allowed);
    if (bad.length > 0) {
      calls.push({ ...result.record, success: false, error: `numbers not in source: ${bad.join(', ')}` });
      lastValid = { output: result.data, choice, model: result.record.model };
      return 'failed';
    }
    calls.push(result.record);
    return { primer: toPrimer(result.data, result.record.model, allowed), servedBy: choice };
  };

  let outcome = await attempt(primary);
  if (typeof outcome === 'object') return outcome;
  if (outcome !== 'refusal') {
    outcome = await attempt(primary);
    if (typeof outcome === 'object') return outcome;
  }
  if (fallback) {
    outcome = await attempt(fallback);
    if (typeof outcome === 'object') return outcome;
  }

  const valid = lastValid as { output: PrimerOutput; choice: ModelChoice; model: string } | null;
  if (valid) {
    const primer = toPrimer(valid.output, valid.model, allowed);
    console.warn(`Primer kept after removing ${primer.droppedSentences} ungrounded sentence(s)`);
    return { primer, servedBy: valid.choice };
  }
  const error: Error = lastError ?? new Error('No primer was generated');
  console.error('Primer generation failed:', error.message);
  throw error;
}
