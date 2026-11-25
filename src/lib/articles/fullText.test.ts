import { findFreeFullText, unpaywallPdfUrls } from './fullText';

jest.mock('./pdf', () => ({ pdfToSections: jest.fn() }));
jest.mock('@/lib/trials/ncbi', () => ({ ncbiFetch: jest.fn() }));

const SECTIONS = [{ id: 's1', heading: 'Methods', text: 'Text.' }];

describe('findFreeFullText', () => {
  it('prefers PubMed Central', async () => {
    const pmc = jest.fn().mockResolvedValue(SECTIONS);
    const unpaywall = jest.fn();
    expect(await findFreeFullText({ pmcid: 'PMC1', doi: '10.1/x' }, { pmc, unpaywall })).toEqual({
      source: 'pmc',
      sections: SECTIONS,
    });
    expect(unpaywall).not.toHaveBeenCalled();
  });

  it('falls back to Unpaywall, then gives up', async () => {
    const pmc = jest.fn().mockResolvedValue(null);
    const unpaywall = jest.fn().mockResolvedValueOnce(SECTIONS).mockResolvedValueOnce(null);
    expect((await findFreeFullText({ pmcid: 'PMC1', doi: '10.1/x' }, { pmc, unpaywall }))?.source).toBe('unpaywall');
    expect(await findFreeFullText({ pmcid: null, doi: '10.1/x' }, { pmc, unpaywall })).toBeNull();
    expect(await findFreeFullText({ pmcid: null, doi: null }, { pmc, unpaywall })).toBeNull();
  });
});

describe('unpaywallPdfUrls', () => {
  const OLD = process.env;
  afterEach(() => {
    process.env = OLD;
  });

  it('needs a contact email', async () => {
    process.env = { ...OLD, UNPAYWALL_EMAIL: '', NCBI_EMAIL: '' };
    const fetchImpl = jest.fn();
    expect(await unpaywallPdfUrls('10.1/x', fetchImpl as never)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns https PDF links, best first, without duplicates', async () => {
    process.env = { ...OLD, UNPAYWALL_EMAIL: 'dev@example.org' };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_oa: true,
        best_oa_location: { url_for_pdf: 'https://a.org/1.pdf' },
        oa_locations: [{ url_for_pdf: 'https://a.org/1.pdf' }, { url_for_pdf: 'http://insecure/2.pdf' }, { url_for_pdf: null }, { url_for_pdf: 'https://b.org/3.pdf' }],
      }),
    });
    expect(await unpaywallPdfUrls('10.1/x', fetchImpl as never)).toEqual(['https://a.org/1.pdf', 'https://b.org/3.pdf']);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.unpaywall.org/v2/10.1%2Fx?email=dev%40example.org');
  });

  it('returns nothing for closed-access articles', async () => {
    process.env = { ...OLD, UNPAYWALL_EMAIL: 'dev@example.org' };
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ is_oa: false }) });
    expect(await unpaywallPdfUrls('10.1/x', fetchImpl as never)).toEqual([]);
  });
});
