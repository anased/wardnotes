import { render, screen } from '@testing-library/react';
import NoteFieldBadges from './NoteFieldBadges';

describe('NoteFieldBadges', () => {
  it('renders nothing for an answered note without a type', () => {
    const { container } = render(<NoteFieldBadges note={{ status: 'answered', content_type: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the content type label', () => {
    render(<NoteFieldBadges note={{ status: 'answered', content_type: 'trial' }} />);
    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.queryByText('Unanswered')).not.toBeInTheDocument();
  });

  it('shows an Unanswered badge for open questions', () => {
    render(<NoteFieldBadges note={{ status: 'unanswered', content_type: 'question' }} />);
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
  });

  it('copes with notes loaded before the fields existed', () => {
    const legacy = {} as { status: 'answered'; content_type: null };
    const { container } = render(<NoteFieldBadges note={legacy} />);
    expect(container).toBeEmptyDOMElement();
  });
});
