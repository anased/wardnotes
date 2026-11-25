import { fireEvent, render, screen } from '@testing-library/react';
import GuidedReader from './GuidedReader';
import CheckYourself from './CheckYourself';
import type { ArticleGuide } from '@/lib/articles/types';

const GUIDE = {
  id: 'g1',
  article_read_id: 'a1',
  user_id: 'u1',
  budget_minutes: 20,
  model: 'opus',
  created_at: '',
  sections: [
    { id: 's1', heading: 'Methods', text: 'We enrolled 4881 adults.' },
    { id: 's2', heading: 'Results', text: 'Events 5.0% vs 6.5%.' },
  ],
  facts: [{ id: 'f1', sectionId: 's2', kind: 'result', claim: 'Fewer events.', excerpt: 'Events 5.0% vs 6.5%.' }],
  guide: {
    steps: [
      { sectionId: 's1', title: 'Who was enrolled', minutes: 5, lookFor: 'The window.', factIds: [] },
      { sectionId: 's2', title: 'Primary result', minutes: 8, lookFor: 'The event rates.', factIds: ['f1'] },
    ],
    stats: [],
    appraisal: { strengths: [], weaknesses: [], biasRisk: 'low', biasReason: '' },
    qa: [],
    quiz: [{ question: 'Event rate with drug A?', options: ['5.0%', '9%'], answerIndex: 0, explanation: 'From the results.', factId: 'f1' }],
    removed: 0,
  },
} as ArticleGuide;

describe('GuidedReader', () => {
  it('walks through the stops and shows the section on request', () => {
    const onFinish = jest.fn();
    render(<GuidedReader guide={GUIDE} onFinish={onFinish} />);
    expect(screen.getByText('Who was enrolled')).toBeInTheDocument();
    expect(screen.getByText('Read: Methods')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the full section'));
    expect(screen.getByText('We enrolled 4881 adults.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next stop'));
    expect(screen.getByText('Primary result')).toBeInTheDocument();
    expect(screen.getByText('“Events 5.0% vs 6.5%.”')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Check yourself'));
    expect(onFinish).toHaveBeenCalled();
  });
});

describe('CheckYourself', () => {
  it('reveals the answer, explanation and the quote it rests on', () => {
    render(<CheckYourself guide={GUIDE} />);
    fireEvent.click(screen.getByText('9%'));
    expect(screen.getByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText('From the results.')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 right')).toBeInTheDocument();
    expect(screen.getByText('“Events 5.0% vs 6.5%.”')).toBeInTheDocument();
  });
});
