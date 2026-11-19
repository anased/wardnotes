// src/lib/trials/extractTrial.ts
// Turn a trial abstract into the fields of the trial form. Server-side only.
// Model routing (cheap model first, stronger model as fallback) comes from lib/ai/models.
import { z } from 'zod/v4';
import { getTaskModel, type ModelChoice, type TaskModelConfig } from '@/lib/ai/models';
import { generateStructured, type StructuredResult } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';

const nullableText = (description: string) => z.string().nullable().describe(description);

export const ExtractedTrialSchema = z.object({
  is_clinical_trial: z
    .boolean()
    .describe('True if the source reports results of a clinical trial (RCT or other interventional study)'),
  acronym: nullableText('Trial acronym exactly as written in the source, e.g. "POINT". Null if none is given.'),
  full_name: nullableText(
    'What the acronym stands for, only if the source spells it out. Null otherwise; never guess an expansion.'
  ),
  year: z
    .number()
    .int()
    .nullable()
    .describe('Year the primary results were published, only if stated in the source'),
  population: nullableText('Who was enrolled: condition, key inclusion criteria, timing, and sample size'),
  intervention: nullableText('Treatment given to the intervention arm, with dose and duration when stated'),
  comparator: nullableText('What the control arm received (placebo, standard care, or an active comparator)'),
  result: nullableText(
    'Primary outcome and its result with the key numbers (event rates, effect size with CI/p), then the main safety outcome'
  ),
  notes: nullableText(
    'Important secondary findings, caveats, or limitations stated in the source (e.g. early stopping, subgroup effects). Null if none.'
  ),
});

export type ExtractedTrial = z.infer<typeof ExtractedTrialSchema>;

const SYSTEM_PROMPT = `You extract structured summaries of clinical trials for medical residents' study notes.

Extract the requested fields from the source text the user provides.

Rules:
- Use only information stated in the source. Do not add facts from memory, even if you recognise the trial; if a field isn't covered, return null for it.
- Keep numbers exact: copy event rates, hazard ratios, confidence intervals, p-values and sample sizes as written.
- Write each field as a compact phrase or one to two short sentences, in the style of a clinician's note, e.g.:
  population: "5,170 adults with minor ischaemic stroke (NIHSS ≤3) or high-risk TIA (ABCD2 ≥4) within 12 h"
  intervention: "Clopidogrel (600 mg load, then 75 mg/day) + aspirin for 90 days"
  result: "Fewer major ischaemic events at 90 days (5.0% vs 6.5%; HR 0.75, 95% CI 0.59–0.95); more major haemorrhage (0.9% vs 0.4%)"
- Use plain text only: no Markdown.
- If the source is not a clinical trial report (e.g. a review, cohort study, or editorial), set is_clinical_trial to false and still fill in whatever fields apply.`;

export interface TrialExtractionSource {
  title?: string | null;
  journal?: string | null;
  year?: number | null;
  abstract: string;
}

export interface TrialExtractionResult {
  trial: ExtractedTrial;
  /** The model whose output was used. */
  servedBy: ModelChoice;
}

export function buildExtractionPrompt(source: TrialExtractionSource): string {
  const header = [
    source.title ? `Title: ${source.title}` : null,
    source.journal ? `Journal: ${source.journal}` : null,
    source.year ? `Publication year: ${source.year}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return `<source>\n${header ? `${header}\n\n` : ''}${source.abstract}\n</source>`;
}

/**
 * Extract trial fields with the configured model chain:
 *   1. primary (cheap) model
 *   2. on invalid/truncated output: the same model once more
 *   3. then the fallback (stronger) model
 * A refusal skips the retry and goes straight to the fallback model.
 *
 * Every call made is appended to `calls` (also when this throws), so the caller can
 * log each one. Throws the last failure if no model produced valid output, or any
 * transport/API error as soon as it happens.
 */
export async function extractTrialFromAbstract(
  source: TrialExtractionSource,
  calls: AiCallRecord[] = [],
  config: TaskModelConfig = getTaskModel('trialExtraction')
): Promise<TrialExtractionResult> {
  const { fallback, ...primary } = config;
  const user = buildExtractionPrompt(source);
  const run = (choice: ModelChoice) =>
    generateStructured({
      task: 'trialExtraction',
      choice,
      system: SYSTEM_PROMPT,
      user,
      schema: ExtractedTrialSchema,
      schemaName: 'extracted_trial',
    });

  let result: StructuredResult<ExtractedTrial> = await run(primary);
  calls.push(result.record);
  if (result.ok) return { trial: result.data, servedBy: primary };

  if (result.failure !== 'refusal') {
    result = await run(primary);
    calls.push(result.record);
    if (result.ok) return { trial: result.data, servedBy: primary };
  }

  if (fallback) {
    result = await run(fallback);
    calls.push(result.record);
    if (result.ok) return { trial: result.data, servedBy: fallback };
  }

  console.error(`Trial extraction failed (${result.failure}):`, result.error.message);
  throw result.error;
}
