import { extractText } from 'unpdf';
import { SCANNED_PDF_MESSAGE, looksScanned, pdfToSections } from './pdf';

// unpdf is ESM-only (import.meta), which Jest's CommonJS transform can't load; its
// output is faked here. Real PDFs are checked with scripts/articles/check-pdf.mjs.
jest.mock('unpdf', () => ({ getDocumentProxy: jest.fn().mockResolvedValue({}), extractText: jest.fn() }));
const mockExtract = extractText as jest.MockedFunction<typeof extractText>;

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const PDF = bytes('%PDF-1.7 fake');
const para = 'Adults were randomly assigned to drug A or placebo and followed for 90 days. ';

beforeEach(() => mockExtract.mockReset());

describe('pdfToSections', () => {
  it('splits a text PDF into sections', async () => {
    mockExtract.mockResolvedValue({
      totalPages: 2,
      text: [`Title\nMethods\n${para.repeat(12)}`, `Results\n${para.repeat(12)}`],
    } as never);
    const sections = await pdfToSections(PDF);
    expect(sections.map((s) => s.heading)).toEqual(['Opening', 'Methods', 'Results']);
  });

  it('rejects a scan with the scanned-PDF message', async () => {
    mockExtract.mockResolvedValue({ totalPages: 3, text: ['', ' ', ''] } as never);
    await expect(pdfToSections(PDF)).rejects.toThrow(SCANNED_PDF_MESSAGE);
  });

  it('rejects files that are not PDFs without parsing them', async () => {
    await expect(pdfToSections(bytes('<html>'))).rejects.toThrow("couldn't be opened");
    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe('looksScanned', () => {
  it('needs enough text overall and per page', () => {
    expect(looksScanned(['x'.repeat(2000)])).toBe(false);
    expect(looksScanned(['x'.repeat(1000)])).toBe(true);
    expect(looksScanned(['x'.repeat(1600), ...Array(20).fill('')])).toBe(true);
  });
});
