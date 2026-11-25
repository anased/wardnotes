import { generateStructured, type StructuredResult } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';
import { sourceNumberSet } from './grounding';
import { GuideGenerationError, buildGuide, cleanGuide, validateFacts, type GuideOutput } from './guide';
import type { ArticleSection } from './sections';
import type { GuideFact } from './types';

jest.mock('@/lib/ai/providers', () => ({ generateStructured: jest.fn() }));
const mockGenerate = generateStructured as jest.MockedFunction<typeof generateStructured>;

const SECTIONS: ArticleSection[] = [
  { id: 's1', heading: 'Methods', text: 'We randomly assigned 4881 adults with minor stroke within 12 hours to clopidogrel plus aspirin or aspirin alone.' },
  { id: 's2', heading: 'Results', text: 'Major ischemic events occurred in 121 patients (5.0%) and 160 patients (6.5%), hazard ratio 0.75 (95% CI, 0.59 to 0.95).' },
  { id: 's3', heading: 'Discussion', text: 'Major hemorrhage was more common with dual therapy. The trial was stopped early.' },
];
const ARTICLE = { title: 'POINT', journal: 'NEJM', year: 2018, studyKind: 'rct' as const, sections: SECTIONS };

const GOOD_FACTS = {
  facts: [
    { section_id: 's1', kind: 'design' as const, claim: '4881 adults were randomised.', excerpt: 'We randomly assigned 4881 adults with minor stroke' },
    { section_id: 's2', kind: 'result' as const, claim: 'Events: 5.0% vs 6.5%.', excerpt: 'Major ischemic events occurred in 121 patients (5.0%)' },
    { section_id: 's2', kind: 'result' as const, claim: 'HR 0.75.', excerpt: 'hazard ratio 0.75 (95% CI, 0.59 to 0.95)' },
    { section_id: 's3', kind: 'safety' as const, claim: 'More major hemorrhage.', excerpt: 'Major hemorrhage was more common with dual therapy' },
    { section_id: 's3', kind: 'limitation' as const, claim: 'Stopped early.', excerpt: 'The trial was stopped early.' + ' ' },
    { section_id: 's1', kind: 'population' as const, claim: 'Within 12 hours.', excerpt: 'adults with minor stroke within 12 hours' },
  ],
};

const GUIDE: GuideOutput = {
  steps: [
    { section_id: 's1', title: 'Who was enrolled', minutes: 5, look_for: 'Note the 12-hour window.', fact_ids: ['f1', 'f6'] },
    { section_id: 's2', title: 'Primary result', minutes: 8, look_for: 'Compare 5.0% vs 6.5%.', fact_ids: ['f2', 'f9'] },
    { section_id: 's9', title: 'Missing section', minutes: 3, look_for: 'x', fact_ids: [] },
  ],
  stats: [
    { label: 'Hazard ratio', value: '0.75 (0.59-0.95)', meaning: 'A 25% relative reduction.', fact_id: 'f3' },
    { label: 'Events', value: '5.0% vs 6.5%', meaning: 'Fewer events with dual therapy.', fact_id: 'f2' },
  ],
  strengths: [{ text: 'Large randomised trial.', fact_ids: ['f1'] }],
  weaknesses: [{ text: 'Stopped early.', fact_ids: ['f5'] }],
  bias_risk: 'low',
  bias_reason: 'Randomised and blinded.',
  qa: [{ question: 'What was the HR?', answer: '0.75.', fact_ids: ['f3'] }],
  quiz: [
    { question: 'Primary event rate with dual therapy?', options: ['5.0%', '6.5%', '4.0%', '7.0%'], answer_index: 0, explanation: '5.0% vs 6.5%.', fact_id: 'f2' },
    { question: 'Bad index', options: ['a', 'b'], answer_index: 3, explanation: 'x', fact_id: 'f2' },
  ],
};

function rec(task: AiCallRecord['task'], success = true): AiCallRecord {
  return { task, provider: 'anthropic', model: 'opus', inputTokens: 1, outputTokens: 1, totalInputTokens: 1, costUsd: 0, success };
}
const ok = <T,>(task: AiCallRecord['task'], data: T) => ({ ok: true, data, record: rec(task) }) as StructuredResult<unknown>;

beforeEach(() => mockGenerate.mockReset());

describe('validateFacts', () => {
  it('keeps facts with verbatim excerpts and grounded numbers, renumbering them', () => {
    const output = {
      facts: [
        ...GOOD_FACTS.facts.slice(0, 2),
        { section_id: 's2', kind: 'result' as const, claim: 'NNT of 67.', excerpt: 'hazard ratio 0.75 (95% CI, 0.59 to 0.95)' },
        { section_id: 's2', kind: 'result' as const, claim: 'Paraphrased.', excerpt: 'Ischemic events happened in 121 people' },
        { section_id: 's1', kind: 'result' as const, claim: 'Wrong section.', excerpt: 'Major ischemic events occurred in 121 patients' },
        { section_id: 'zz', kind: 'other' as const, claim: 'Unknown section.', excerpt: 'whatever text goes here ok' },
      ],
    };
    const { facts, removed } = validateFacts(output, SECTIONS);
    expect(facts.map((f) => [f.id, f.sectionId])).toEqual([
      ['f1', 's1'],
      ['f2', 's2'],
    ]);
    expect(removed).toBe(4);
  });
});

describe('cleanGuide', () => {
  const facts = validateFacts(GOOD_FACTS, SECTIONS).facts as GuideFact[];
  const allowed = sourceNumberSet(SECTIONS.map((s) => s.text).join('\n'));

  it('drops unknown sections and fact ids, ungrounded numbers and broken quiz items', () => {
    const guide = cleanGuide(GUIDE, facts, SECTIONS, allowed);
    expect(guide.steps.map((s) => s.sectionId)).toEqual(['s1', 's2']);
    expect(guide.steps[1].factIds).toEqual(['f2']);
    // "A 25% relative reduction." isn't in the article, so that stat loses its meaning and goes.
    expect(guide.stats.map((s) => s.label)).toEqual(['Events']);
    expect(guide.quiz).toHaveLength(1);
    expect(guide.removed).toBe(4); // step s9, the stat's sentence + the stat, the bad quiz item
  });
});

describe('buildGuide', () => {
  it('runs facts then guide, logging both calls', async () => {
    mockGenerate.mockResolvedValueOnce(ok('articleFacts', GOOD_FACTS)).mockResolvedValueOnce(
      ok('articleGuide', { ...GUIDE, stats: GUIDE.stats.slice(1) })
    );
    const calls: AiCallRecord[] = [];
    const result = await buildGuide(ARTICLE, 20, calls);
    expect(result.facts).toHaveLength(6);
    expect(result.guide.steps).toHaveLength(2);
    expect(calls.map((c) => [c.task, c.success])).toEqual([
      ['articleFacts', true],
      ['articleGuide', true],
    ]);
    const factsPrompt = mockGenerate.mock.calls[0][0].user;
    expect(factsPrompt).toContain('<section id="s2" heading="Results">');
    expect(factsPrompt).toContain('15 to 25 facts');
  });

  it('retries the facts step when too few excerpts match', async () => {
    mockGenerate
      .mockResolvedValueOnce(ok('articleFacts', { facts: GOOD_FACTS.facts.slice(0, 3) }))
      .mockResolvedValueOnce(ok('articleFacts', GOOD_FACTS))
      .mockResolvedValueOnce(ok('articleGuide', { ...GUIDE, stats: GUIDE.stats.slice(1) }));
    const calls: AiCallRecord[] = [];
    const result = await buildGuide(ARTICLE, 20, calls);
    expect(result.facts).toHaveLength(6);
    expect(calls.map((c) => c.success)).toEqual([false, true, true]);
  });

  it('retries the guide when it has numbers not in the article', async () => {
    mockGenerate
      .mockResolvedValueOnce(ok('articleFacts', GOOD_FACTS))
      .mockResolvedValueOnce(ok('articleGuide', GUIDE))
      .mockResolvedValueOnce(ok('articleGuide', { ...GUIDE, stats: GUIDE.stats.slice(1) }));
    const calls: AiCallRecord[] = [];
    const result = await buildGuide(ARTICLE, 20, calls);
    expect(calls.map((c) => c.success)).toEqual([true, false, true]);
    expect(calls[1].error).toBe('numbers not in article: 25');
    expect(result.guide.stats).toHaveLength(1);
  });

  it('gives up when the text yields too few checkable facts', async () => {
    mockGenerate.mockResolvedValue(ok('articleFacts', { facts: GOOD_FACTS.facts.slice(0, 2) }));
    await expect(buildGuide(ARTICLE, 20, [])).rejects.toBeInstanceOf(GuideGenerationError);
  });
});
