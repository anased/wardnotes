import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotePropertiesBar from './NotePropertiesBar';
import type { NoteTopicLink } from '@/lib/utils/noteTopicLinks';
import type { LinkDraftWithTitle } from '../links/NoteLinksField';

const topics = [
  { id: 't1', name: 'Ischemic stroke', parent_ids: [], aliases: [] },
  { id: 't2', name: 'Epilepsy', parent_ids: [], aliases: [] },
];
const byId = new Map(topics.map((t) => [t.id, t]));

jest.mock('@/lib/hooks/useTopics', () => ({
  __esModule: true,
  default: () => ({ topics, graph: { byId } }),
}));
jest.mock('@/lib/utils/topicTree', () => ({
  ancestorPaths: () => [],
  matchTopics: (list: typeof topics, q: string) =>
    list.filter((t) => t.name.toLowerCase().includes(q)).map((topic) => ({ topic, matchedAlias: null })),
  normalizeTopicName: (s: string) => s.trim().toLowerCase(),
  findTopicByName: () => null,
}));
jest.mock('@/lib/supabase/topicSections', () => ({
  getTopicSections: jest.fn(async (id: string) => (id === 't1' ? [{ id: 's1', name: 'Thrombolysis' }] : [])),
}));
jest.mock('../topics/TopicFormModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../links/LinkPickerModal', () => ({ __esModule: true, default: () => null }));

function Harness({ initialTopics = [] as NoteTopicLink[], initialLabels = [] as string[] }) {
  const [t, setT] = useState<NoteTopicLink[]>(initialTopics);
  const [labels, setLabels] = useState<string[]>(initialLabels);
  const [links, setLinks] = useState<LinkDraftWithTitle[]>([
    { relation: 'cites', target_type: 'trial', target_id: 'x', title: 'WAKE-UP' },
  ]);
  return (
    <>
      <NotePropertiesBar
        topics={t}
        onTopicsChange={setT}
        labels={labels}
        onLabelsChange={setLabels}
        labelSuggestions={['boards']}
        links={links}
        onLinksChange={setLinks}
      />
      <output data-testid="state">{JSON.stringify({ t, labels, links: links.length })}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent || '{}');

describe('NotePropertiesBar', () => {
  it('adds a topic from the Topic popover; the first becomes primary', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Topic' }));
    await userEvent.type(screen.getByRole('combobox'), 'isch');
    await userEvent.click(await screen.findByRole('option', { name: /Ischemic stroke/ }));

    expect(state().t).toEqual([{ topic_id: 't1', section_id: null, is_primary: true }]);
    expect(screen.getByRole('img', { name: 'Primary topic' })).toBeInTheDocument();
  });

  it('edits a topic chip: section, primary and remove', async () => {
    render(
      <Harness
        initialTopics={[
          { topic_id: 't1', section_id: null, is_primary: true },
          { topic_id: 't2', section_id: null, is_primary: false },
        ]}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Primary topic Ischemic stroke/ }));
    const section = await screen.findByLabelText('Section');
    await screen.findByRole('option', { name: 'Thrombolysis' });
    await userEvent.selectOptions(section, 's1');
    expect(state().t[0].section_id).toBe('s1');

    await userEvent.click(screen.getByRole('button', { name: 'Epilepsy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make primary' }));
    expect(state().t.find((l: NoteTopicLink) => l.topic_id === 't2').is_primary).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Remove topic Ischemic stroke' }));
    expect(state().t).toHaveLength(1);
  });

  it('adds and removes labels, and removes links', async () => {
    render(<Harness initialLabels={['imaging']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Label' }));
    await userEvent.type(screen.getByRole('combobox'), 'boards{Enter}');
    expect(state().labels).toEqual(['imaging', 'boards']);
    expect(screen.getByText('#boards')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove label imaging' }));
    expect(state().labels).toEqual(['boards']);

    await userEvent.click(screen.getByRole('button', { name: /Remove link: cites WAKE-UP/ }));
    expect(state().links).toBe(0);
  });

  it('closes a popover with Escape', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Label' }));
    expect(screen.getByRole('dialog', { name: 'Add label' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
