import { render, screen } from '@testing-library/react';
import PrimerCard from './PrimerCard';
import { verdictText } from './VerdictBadge';
import type { Primer } from '@/lib/articles/types';

const PRIMER: Primer = {
  question: 'Does drug A reduce events?',
  bottomLine: 'Yes (5.0% vs 6.5%).',
  verdict: 'read',
  verdictReason: 'Large RCT.',
  minutes: 25,
  abstractOnly: true,
  droppedSentences: 0,
  model: 'cheap',
  createdAt: '2026-11-25T00:00:00.000Z',
};

describe('verdictText', () => {
  it.each([
    ['read', 25, 'Read · 25 min'],
    ['skim', 10, 'Skim · 10 min'],
    ['skip', 0, 'Skip'],
  ] as const)('%s %d -> %s', (verdict, minutes, text) => {
    expect(verdictText(verdict, minutes)).toBe(text);
  });
});

describe('PrimerCard', () => {
  it('shows the question, bottom line and verdict', () => {
    render(<PrimerCard primer={PRIMER} />);
    expect(screen.getByText('Does drug A reduce events?')).toBeInTheDocument();
    expect(screen.getByText('Yes (5.0% vs 6.5%).')).toBeInTheDocument();
    expect(screen.getByText('Read · 25 min')).toBeInTheDocument();
    expect(screen.getByText(/Every number was checked against the source\.$/)).toBeInTheDocument();
  });

  it('says when sentences were removed by the number check', () => {
    render(<PrimerCard primer={{ ...PRIMER, droppedSentences: 2 }} />);
    expect(screen.getByText(/2 sentences that didn't match were removed/)).toBeInTheDocument();
  });
});
