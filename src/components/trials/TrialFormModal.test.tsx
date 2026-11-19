import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrialFormModal from './TrialFormModal';

jest.mock('@/lib/hooks/useTrials', () => ({
  __esModule: true,
  default: () => ({ trials: [], createTrial: jest.fn(), updateTrial: jest.fn(), deleteTrial: jest.fn() }),
}));
jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
jest.mock('@/lib/supabase/trials', () => ({
  getTrialTopics: jest.fn(async () => []),
  trialErrorMessage: (e: unknown) => String(e),
}));
jest.mock('../topics/NoteTopicPicker', () => ({ __esModule: true, default: () => null }));

const candidate = (pmid: string, title: string, extra: Record<string, unknown> = {}) => ({
  pmid,
  title,
  journal: null,
  journalAbbrev: 'N Engl J Med',
  year: 2018,
  firstAuthor: 'Johnston SC',
  doi: null,
  isRct: true,
  nctIds: [],
  acronymMatch: 'registry',
  secondary: false,
  score: 200,
  ...extra,
});

const SEARCH = {
  query: 'POINT',
  ambiguous: true,
  notice: '5 registered trials are called "POINT". Check the journal, year and authors before picking one.',
  candidates: [
    candidate('29766750', 'Clopidogrel and Aspirin in Acute Ischemic Stroke and High-Risk TIA'),
    candidate('2', 'Second paper', { isRct: false, journalAbbrev: 'JAMA', year: 2015 }),
    candidate('3', 'Third paper'),
    candidate('4', 'Fourth paper (not shown)'),
  ],
};

const EXTRACT = {
  trial: {
    is_clinical_trial: true,
    acronym: 'POINT',
    full_name: null,
    year: 2018,
    population: 'Minor stroke or high-risk TIA',
    intervention: 'Clopidogrel + aspirin',
    comparator: 'Aspirin',
    result: 'Fewer major ischaemic events',
    notes: null,
  },
  source: { pmid: '29766750', title: 'Clopidogrel and Aspirin…', journal: 'NEJM', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29766750/' },
};

const fetchMock = jest.fn();

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const requests = () => fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);

function renderModal() {
  render(<TrialFormModal isOpen onClose={() => {}} />);
  return screen.getByLabelText(/Fill from a trial/i);
}

describe('TrialFormModal trial search', () => {
  it('searches by name, shows the top 3 candidates, and extracts from the picked PMID', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => respond(url === '/api/trials/search' ? SEARCH : EXTRACT));
    const input = renderModal();

    await user.type(input, 'POINT');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    const region = await screen.findByRole('region', { name: /matching trial publications/i });
    expect(within(region).getByText(/5 registered trials are called "POINT"/)).toBeInTheDocument();
    const options = within(region).getAllByRole('listitem');
    expect(options).toHaveLength(3);
    expect(within(options[0]).getByText('RCT')).toBeInTheDocument();
    expect(within(options[0]).getByText('N Engl J Med · 2018 · Johnston SC et al.')).toBeInTheDocument();
    expect(within(options[1]).queryByText('RCT')).not.toBeInTheDocument();
    expect(screen.queryByText('Fourth paper (not shown)')).not.toBeInTheDocument();

    await user.click(within(options[0]).getByRole('button'));

    await waitFor(() => expect(screen.getByLabelText('Population')).toHaveValue('Minor stroke or high-risk TIA'));
    expect(requests()).toEqual([
      ['/api/trials/search', { query: 'POINT' }],
      ['/api/trials/extract', { source: '29766750' }],
    ]);
    expect(screen.queryByRole('region', { name: /matching trial publications/i })).not.toBeInTheDocument();
  });

  it('sends PMIDs straight to extraction (existing flow)', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => respond(EXTRACT));
    const input = renderModal();

    await user.type(input, '29766750');
    await user.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Intervention')).toHaveValue('Clopidogrel + aspirin'));
    expect(requests()).toEqual([['/api/trials/extract', { source: '29766750' }]]);
  });

  it('"None of these" clears the results and asks for a PMID/DOI', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => respond(SEARCH));
    const input = renderModal();

    await user.type(input, 'POINT{Enter}');
    await user.click(await screen.findByRole('button', { name: 'None of these: enter PMID/DOI' }));

    expect(screen.queryByRole('region', { name: /matching trial publications/i })).not.toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.getByText(/Enter the PMID, DOI, or PubMed\/journal link/)).toBeInTheDocument();
  });

  it('shows the no-results notice and server errors', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockImplementationOnce(() => respond({ ...SEARCH, ambiguous: false, candidates: [], notice: 'No trial publications found for "ZZZ".' }))
      .mockImplementationOnce(() => respond({ error: "Couldn't reach PubMed or ClinicalTrials.gov." }, 502));
    const input = renderModal();

    await user.type(input, 'ZZZ{Enter}');
    expect(await screen.findByText('No trial publications found for "ZZZ".')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, 'ELAN{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach PubMed or ClinicalTrials.gov.");
  });

  it('reports network failures clearly', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const input = renderModal();

    await user.type(input, 'THALES{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error: check your connection and try again.');
  });
});
