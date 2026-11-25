// src/app/api/articles/[id]/full-text/route.ts
// Find free full text for one of the user's articles (PubMed Central, then Unpaywall)
// and store its sections on the user's copy. No AI and nothing charged. Free full
// text is cached per PMID across users. See docs/deep-read-plan.md.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseArticleCache } from '@/lib/articles/cache';
import { findFreeFullText } from '@/lib/articles/fullText';
import { authenticate, isMissingSchema, loadArticle, notSetUp } from '@/lib/articles/routeAuth';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request);
    if (auth instanceof NextResponse) return auth;
    const article = await loadArticle(auth.db, (await params).id);
    if (article instanceof NextResponse) return article;

    if (article.full_text_source !== 'none') {
      return NextResponse.json({ found: true, source: article.full_text_source, sections: article.sections ?? [] });
    }

    const cache = supabaseArticleCache();
    const fullText =
      (article.pmid ? await cache.getFullText(article.pmid) : null) ??
      (await findFreeFullText({ pmcid: article.pmcid, doi: article.doi }));
    if (!fullText) return NextResponse.json({ found: false });

    if (article.pmid) await cache.putFullText(article.pmid, fullText);
    const { error } = await auth.db
      .from('article_reads')
      .update({ sections: fullText.sections, full_text_source: fullText.source })
      .eq('id', article.id);
    if (error) {
      if (isMissingSchema(error)) return notSetUp('add_article_full_text.sql');
      throw new Error(error.message);
    }
    return NextResponse.json({ found: true, source: fullText.source, sections: fullText.sections });
  } catch (error) {
    console.error('Error finding full text:', error);
    return NextResponse.json({ error: "Couldn't look for the full text. Please try again." }, { status: 500 });
  }
}
