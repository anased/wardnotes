// src/app/api/articles/[id]/pdf/route.ts
// Read the PDF the user uploaded to storage (article-pdfs/<user>/<article>.pdf) and
// store its sections on their copy of the article. A scan with no text layer is
// rejected with a clear message and deleted. No AI and nothing charged.
// [trust] The PDF and its text stay private to the user: never cached or shared.
import { NextRequest, NextResponse } from 'next/server';
import { ScannedPdfError, UnreadablePdfError, pdfToSections } from '@/lib/articles/pdf';
import {
  PDF_BUCKET,
  authenticate,
  isMissingSchema,
  loadArticle,
  notSetUp,
  pdfObjectPath,
} from '@/lib/articles/routeAuth';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request);
    if (auth instanceof NextResponse) return auth;
    const article = await loadArticle(auth.db, (await params).id);
    if (article instanceof NextResponse) return article;

    const path = pdfObjectPath(auth.user.id, article.id);
    const storage = auth.db.storage.from(PDF_BUCKET);
    const { data: blob, error: downloadError } = await storage.download(path);
    if (downloadError || !blob) {
      return NextResponse.json({ error: 'Upload the PDF first.' }, { status: 400 });
    }

    let sections;
    try {
      sections = await pdfToSections(new Uint8Array(await blob.arrayBuffer()));
    } catch (err) {
      if (err instanceof ScannedPdfError || err instanceof UnreadablePdfError) {
        await storage.remove([path]);
        return NextResponse.json({ error: err.message, scanned: err instanceof ScannedPdfError }, { status: 422 });
      }
      throw err;
    }

    const { data, error } = await auth.db
      .from('article_reads')
      .update({ sections, full_text_source: 'pdf', pdf_path: `storage://${PDF_BUCKET}/${path}` })
      .eq('id', article.id)
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) return notSetUp('add_article_full_text.sql');
      throw new Error(error.message);
    }
    return NextResponse.json({ article: data });
  } catch (error) {
    console.error('Error reading uploaded PDF:', error);
    return NextResponse.json({ error: "Couldn't read the PDF. Please try again." }, { status: 500 });
  }
}
