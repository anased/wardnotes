import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildTopicGraph } from '@/lib/utils/topicTree';
import TopicTree from './TopicTree';
import TopicSelect from './TopicSelect';

const t = (id: string, name: string, aliases: string[] = []) => ({
  id,
  user_id: 'u',
  name,
  aliases,
  description: null,
  created_at: '',
  updated_at: '',
});

const topics = [
  t('neuro', 'Neurology'),
  t('cv', 'Cerebrovascular'),
  t('ncc', 'Neurocritical care'),
  t('pres', 'PRES', ['RPLS']),
];
const edges = [
  { parent_id: 'neuro', child_id: 'cv' },
  { parent_id: 'neuro', child_id: 'ncc' },
  { parent_id: 'cv', child_id: 'pres' },
  { parent_id: 'ncc', child_id: 'pres' },
];

jest.mock('@/lib/hooks/useTopics', () => ({
  __esModule: true,
  default: () => ({
    topics,
    edges,
    graph: buildTopicGraph(topics, edges),
    noteCounts: { pres: 3 },
    loading: false,
    error: null,
  }),
}));

jest.mock('@/lib/supabase/topics', () => ({ topicErrorMessage: () => 'error' }));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => window.localStorage.clear());

describe('TopicTree', () => {
  test('starts collapsed and expands on click', async () => {
    render(<TopicTree />);
    expect(screen.getByRole('link', { name: 'Neurology' })).toHaveAttribute('href', '/topics/neuro');
    expect(screen.queryByText('Cerebrovascular')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Expand Neurology' }));
    expect(screen.getByText('Cerebrovascular')).toBeInTheDocument();
  });

  test('a topic with two parents shows under each, with a link marker', () => {
    render(<TopicTree selectedId="pres" />);
    // Selecting PRES expands both of its paths
    const presLinks = screen.getAllByRole('link', { name: /^PRES/ });
    expect(presLinks).toHaveLength(2);
    expect(presLinks[0]).toHaveAccessibleName('PRES , also in Neurocritical care 3');
    expect(presLinks[1]).toHaveAccessibleName('PRES , also in Cerebrovascular 3');
    expect(presLinks[0]).toHaveAttribute('aria-current', 'page');
  });

  test('with onSelect, topics are toggle buttons', async () => {
    const onSelect = jest.fn();
    render(<TopicTree selectedId="neuro" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Expand Neurology' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerebrovascular' }));
    expect(onSelect).toHaveBeenCalledWith('cv');
    await userEvent.click(screen.getByRole('button', { name: 'Neurology', pressed: true }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

function SelectHarness({ onCreate }: { onCreate?: (name: string) => Promise<string | null> }) {
  const [value, setValue] = useState<string[]>([]);
  return <TopicSelect label="Topics" value={value} onChange={setValue} onCreate={onCreate} />;
}

describe('TopicSelect', () => {
  test('typing an alias finds the topic', async () => {
    render(<SelectHarness />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Topics' }), 'rpls');
    const option = screen.getByRole('option', { name: /PRES/ });
    expect(option).toHaveTextContent('PRES(RPLS)');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove topic PRES' })).toBeInTheDocument();
  });

  test('offers to create only when no name or alias matches', async () => {
    const onCreate = jest.fn().mockResolvedValue(null);
    render(<SelectHarness onCreate={onCreate} />);
    const input = screen.getByRole('combobox', { name: 'Topics' });

    await userEvent.type(input, 'RPLS');
    expect(screen.queryByText(/Create topic/)).not.toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, 'Moyamoya');
    await userEvent.click(screen.getByText(/Create topic/));
    expect(onCreate).toHaveBeenCalledWith('Moyamoya');
  });
});
