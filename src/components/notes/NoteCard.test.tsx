import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Note } from '@/lib/supabase/client';
import NoteCard from './NoteCard';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/hooks/useTopics', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildTopicGraph } = require('@/lib/utils/topicTree');
  const t = (id: string, name: string) => ({ id, name, aliases: [] });
  const graph = buildTopicGraph(
    [t('neuro', 'Neurology'), t('cv', 'Cerebrovascular'), t('pres', 'PRES')],
    [
      { parent_id: 'neuro', child_id: 'cv' },
      { parent_id: 'cv', child_id: 'pres' },
    ]
  );
  return { __esModule: true, default: () => ({ graph }) };
});

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
    expect(screen.getAllByRole('button', { name: /^Show notes labeled/ })).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('and 2 more labels: RITE, ICH')).toBeInTheDocument();
  });

  it('puts highlighted (shared) tags among the visible ones', () => {
    render(<NoteCard note={makeNote()} highlightTags={['ICH']} />);
    expect(screen.getByRole('button', { name: 'Show notes labeled ICH' })).toBeInTheDocument();
  });

  it('calls onTagClick instead of navigating when provided', async () => {
    const onTagClick = jest.fn();
    render(<NoteCard note={makeNote()} onTagClick={onTagClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show notes labeled Stroke' }));
    expect(onTagClick).toHaveBeenCalledWith('Stroke');
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the filtered library when a tag is clicked without a handler', async () => {
    render(<NoteCard note={makeNote()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show notes labeled Clinical pearls' }));
    expect(push).toHaveBeenCalledWith('/notes?tag=Clinical%20pearls');
  });

  it('marks unanswered notes with a badge and a dashed border', () => {
    render(<NoteCard note={makeNote({ status: 'unanswered' })} />);
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('border-dashed');
  });

  it('shows the specialty as a neutral chip, not a coloured badge', () => {
    render(<NoteCard note={makeNote({ note_topics: [{ topic_id: 'pres', is_primary: true }] })} />);
    const chip = screen.getByText('Neurology').parentElement!;
    expect(chip.className).toContain('bg-gray-100');
    expect(chip.className).not.toContain('bg-red-100');
  });

  it('takes the specialty from the primary topic’s root, not the category', () => {
    render(
      <NoteCard
        note={makeNote({
          category: 'General',
          note_topics: [{ topic_id: 'pres', is_primary: true }],
        })}
      />
    );
    expect(screen.getByText('Neurology')).toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });

  it('falls back to the category only for notes without topics', () => {
    render(<NoteCard note={makeNote({ category: 'Cardiology', note_topics: [] })} />);
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
  });

  it('shows no specialty when there is neither a topic nor a category', () => {
    render(<NoteCard note={makeNote({ category: null })} />);
    expect(screen.queryByText('Neurology')).not.toBeInTheDocument();
  });
});
