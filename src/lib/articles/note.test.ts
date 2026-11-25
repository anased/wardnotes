import { buildSummaryNoteContent, guideToCards } from './note';
import type { ArticleRead, GuideContent } from './types';

const ARTICLE = {
  id: 'a1',
  title: 'POINT',
  journal: 'NEJM',
  year: 2018,
  pmid: '29766750',
  doi: '10.1056/NEJMoa1800410',
  study_kind: 'rct',
  primer: {
    question: 'Does DAPT help?',
    bottomLine: 'Fewer events (5.0% vs 6.5%).',
    verdict: 'read',
    verdictReason: 'Big RCT.',
    minutes: 25,
    abstractOnly: true,
    droppedSentences: 0,
    model: 'm',
    createdAt: '',
  },
} as unknown as ArticleRead;

const GUIDE: GuideContent = {
  steps: [],
  stats: [{ label: 'HR', value: '0.75', meaning: 'Fewer events.', factId: 'f1' }],
  appraisal: { strengths: [{ text: 'Randomised.', factIds: [] }], weaknesses: [], biasRisk: 'low', biasReason: 'Blinded.' },
  qa: [{ question: 'What was the HR?', answer: '0.75', factIds: [] }],
  quiz: [
    { question: 'Event rate?', options: ['5.0%', '9%'], answerIndex: 0, explanation: '5.0% vs 6.5%.', factId: null },
    { question: 'what was the hr?', options: ['a', 'b'], answerIndex: 1, explanation: 'dup', factId: null },
  ],
  removed: 0,
};

describe('buildSummaryNoteContent', () => {
  it('includes the primer, key numbers, appraisal and source links', () => {
    const json = JSON.stringify(buildSummaryNoteContent(ARTICLE, GUIDE));
    for (const s of ['Bottom line', 'Fewer events (5.0% vs 6.5%).', 'Key numbers', 'HR: ', 'Strengths', 'Risk of bias: ', 'Low. Blinded.', 'https://pubmed.ncbi.nlm.nih.gov/29766750/', 'https://doi.org/10.1056/NEJMoa1800410']) {
      expect(json).toContain(s);
    }
  });

  it('works without a guide', () => {
    const json = JSON.stringify(buildSummaryNoteContent(ARTICLE, null));
    expect(json).toContain('Bottom line');
    expect(json).not.toContain('Key numbers');
  });
});

describe('guideToCards', () => {
  it('makes cards from Q&A and quiz, without duplicate questions', () => {
    expect(guideToCards(GUIDE)).toEqual([
      { front: 'What was the HR?', back: '0.75' },
      { front: 'Event rate?', back: '5.0%\n\n5.0% vs 6.5%.' },
    ]);
  });
});
