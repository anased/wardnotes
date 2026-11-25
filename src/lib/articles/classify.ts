// src/lib/articles/classify.ts
// Map PubMed publication types to a study kind. Pure; client-safe.
import type { StudyKind } from './types';

/** Checked in order: the first kind with a matching publication type wins. */
const RULES: Array<[StudyKind, RegExp]> = [
  ['guideline', /^(practice guideline|guideline|consensus development conference(, nih)?)$/i],
  ['meta_analysis', /^(meta-analysis|systematic review|network meta-analysis)$/i],
  ['rct', /^(randomized controlled trial|equivalence trial|pragmatic clinical trial)$/i],
  ['trial', /^(clinical trial(, phase [iv]+)?|controlled clinical trial|clinical trial protocol|adaptive clinical trial)$/i],
  ['cohort', /^(observational study|multicenter study|comparative study|validation study|twin study)$/i],
  ['case', /^case reports$/i],
  ['review', /^(review|scoping review|systematic review protocol)$/i],
];

export function classifyStudy(publicationTypes: readonly string[]): StudyKind {
  const types = publicationTypes.map((t) => t.trim());
  // A phase III trial that PubMed also tags "Randomized Controlled Trial" is an RCT;
  // RULES order handles that. "Multicenter Study" alone isn't evidence of an
  // observational design when a trial type is present, which order also covers.
  for (const [kind, re] of RULES) {
    if (types.some((t) => re.test(t))) return kind;
  }
  return 'other';
}
