// src/lib/articles/pdf.ts
// Text from a PDF, split into sections. Server-side only.
import { extractText, getDocumentProxy } from 'unpdf';
import { splitPdfSections, textLength, type ArticleSection } from './sections';

/** User-facing message for a PDF with no readable text (see docs/deep-read-plan.md). */
export const SCANNED_PDF_MESSAGE =
  "This PDF looks like a scan, so its text can't be read. Try downloading the PDF from the publisher or PubMed Central instead. You can still use the primer, which is based on the abstract.";

export class ScannedPdfError extends Error {
  status = 422;
  constructor() {
    super(SCANNED_PDF_MESSAGE);
    this.name = 'ScannedPdfError';
  }
}

export class UnreadablePdfError extends Error {
  status = 422;
  constructor() {
    super("This file couldn't be opened as a PDF. Check that it's the article's PDF and try again.");
    this.name = 'UnreadablePdfError';
  }
}

/** Less text than this overall, or per page, means there's no usable text layer. */
const MIN_TOTAL_CHARS = 1_500;
const MIN_CHARS_PER_PAGE = 150;

export function looksScanned(pages: string[]): boolean {
  const chars = textLength(pages);
  return chars < MIN_TOTAL_CHARS || chars / Math.max(1, pages.length) < MIN_CHARS_PER_PAGE;
}

/** "%PDF-": every PDF starts with it. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new UnreadablePdfError();
  }
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } catch (err) {
    console.error('PDF text extraction failed:', err);
    throw new UnreadablePdfError();
  }
}

/** Sections of a PDF; throws ScannedPdfError when it has no usable text. */
export async function pdfToSections(bytes: Uint8Array): Promise<ArticleSection[]> {
  const pages = await extractPdfPages(bytes);
  if (looksScanned(pages)) throw new ScannedPdfError();
  const sections = splitPdfSections(pages);
  if (sections.length === 0) throw new ScannedPdfError();
  return sections;
}
