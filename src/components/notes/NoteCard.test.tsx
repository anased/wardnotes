import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Note } from '@/lib/supabase/client';
import NoteCard from './NoteCard';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/hooks/useCategories', () => ({
  __esModule: true,
  default: () => ({ categories: [{ id: 'c1', name: 'Neurology', color: 'red' }] }),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    user_id: 'u1',
    title: 'What is the definition of END?',
    content: {},
    tags: ['END', 'Stroke', 'Clinical pearls', 'RITE', 'ICH'],
    category: 'Neurology',
    status: 'answered',
    content_type: 'question',
    created_at: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

describe('NoteCard', () => {
  beforeEach(() => push.mockClear());

  it('links the title to the note and keeps the full title available', () => {
    render(<NoteCard note={makeNote()} />);
    const link = screen.getByRole('link', { name: 'What is the definition of END?' });
    expect(link).toHaveAttribute('href', '/notes/n1');
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute(
      'title',
      'What is the definition of END?'
    );
  });

  it('shows at most 3 tags and a +N summary of the rest', () => {
    render(<NoteCard note={makeNote()} />);
    expect(screen.getAllByRole('button', { name: /^Show notes tagged/ })).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('and 2 more tags: RITE, ICH')).toBeInTheDocument();
  });

  it('puts highlighted (shared) tags among the visible ones', () => {
    render(<NoteCard note={makeNote()} highlightTags={['ICH']} />);
    expect(screen.getByRole('button', { name: 'Show notes tagged ICH' })).toBeInTheDocument();
  });

  it('calls onTagClick instead of navigating when provided', async () => {
    const onTagClick = jest.fn();
    render(<NoteCard note={makeNote()} onTagClick={onTagClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show notes tagged Stroke' }));
    expect(onTagClick).toHaveBeenCalledWith('Stroke');
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the filtered library when a tag is clicked without a handler', async () => {
    render(<NoteCard note={makeNote()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show notes tagged Clinical pearls' }));
    expect(push).toHaveBeenCalledWith('/notes?tag=Clinical%20pearls');
  });

  it('marks unanswered notes with a badge and a dashed border', () => {
    render(<NoteCard note={makeNote({ status: 'unanswered' })} />);
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('border-dashed');
  });

  it('shows the category as a neutral chip, not a red badge', () => {
    render(<NoteCard note={makeNote()} />);
    const chip = screen.getByText('Neurology').parentElement!;
    expect(chip.className).toContain('bg-gray-100');
    expect(chip.className).not.toContain('bg-red-100');
  });
});
