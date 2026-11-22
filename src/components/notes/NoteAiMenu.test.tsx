import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoteAiMenu from './NoteAiMenu';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) } },
}));
jest.mock('@/lib/analytics/useAnalytics', () => ({ useAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/lib/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: null, isPremium: true }),
}));
jest.mock('@/lib/hooks/useQuota', () => ({ useQuota: () => ({ refreshQuota: jest.fn() }) }));
const showNotification = jest.fn();
jest.mock('@/lib/context/NotificationContext', () => ({ useNotification: () => ({ showNotification }) }));
jest.mock('../premium/PremiumFeatureGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../premium/InlineQuotaIndicator', () => ({ __esModule: true, default: () => null }));

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

describe('NoteAiMenu', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists the AI features and disables Improve on an empty note', async () => {
    render(<NoteAiMenu content={doc('')} onApplyMarkdown={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /AI/ }));
    expect(screen.getByRole('button', { name: /Learn from an encounter/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Improve note/ })).toBeDisabled();
  });

  it('opens the Learn from an encounter dialog', async () => {
    render(<NoteAiMenu content={doc('')} onApplyMarkdown={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /AI/ }));
    await userEvent.click(screen.getByRole('button', { name: /Learn from an encounter/ }));
    expect(screen.getByRole('dialog', { name: 'Learn from an encounter' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clinical context')).toBeInTheDocument();
  });

  it('improves the note, previews it and applies it', async () => {
    const onApply = jest.fn();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ improvedNote: '## Better note' }),
    })) as unknown as typeof fetch;

    render(<NoteAiMenu content={doc('Some draft text')} onApplyMarkdown={onApply} />);
    await userEvent.click(screen.getByRole('button', { name: /AI/ }));
    expect(screen.getByText(/15 \/ 4,000 characters/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Improve note/ }));

    expect(await screen.findByRole('dialog', { name: 'Improved note preview' })).toHaveTextContent('## Better note');
    await userEvent.click(screen.getByRole('button', { name: 'Apply improvements' }));
    expect(onApply).toHaveBeenCalledWith('## Better note');
  });
});
