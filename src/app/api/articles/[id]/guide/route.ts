// src/app/api/articles/[id]/guide/route.ts
// Build a Deep Read guide for one of the user's articles from its full text: facts
// with verbatim excerpts, then the reading map, stats decoder, appraisal, Q&A and
// quiz. Charged to the AI-assist (note_improvement) quota, logged as article_guide,
// refunded if it fails. See docs/deep-read-plan.md.
import { NextRequest, NextResponse } from 'next/server';
import { toHttpError } from '@/lib/ai/claude';
import type { AiCallRecord } from '@/lib/ai/usage';
import { checkAndIncrementQuota, logAiCalls, refundQuota } from '@/lib/services/quotaService';
import { GuideGenerationError, buildGuide } from '@/lib/articles/guide';
import { authenticate, isMissingSchema, loadArticle, notSetUp } from '@/lib/articles/routeAuth';
import { GUIDE_BUDGETS, type GuideBudget } from '@/lib/articles/types';

// Two model calls over the full text.
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let chargedUserId: string | null = null;
  const aiCalls: AiCallRecord[] = [];
  try {
    // 1. Auth, article, input — all before charging
    const auth = await authenticate(request);
    if (auth instanceof NextResponse) return auth;
    const article = await loadArticle(auth.db, (await params).id);
    if (article instanceof NextResponse) return article;

    const body = (await request.json().catch(() => ({}))) as { budget?: unknown };
    const budget = (body.budget ?? 20) as GuideBudget;
    if (!GUIDE_BUDGETS.includes(budget)) {
      return NextResponse.json({ error: 'Choose 10, 20 or 45 minutes.' }, { status: 400 });
    }
    if (!article.sections?.length || article.full_text_source === 'none') {
      return NextResponse.json(
        { error: 'A guide needs the full text. Upload the PDF first.', needsFullText: true },
        { status: 409 }
      );
    }

    // 2. Quota (shared AI-assist quota)
    const quota = await checkAndIncrementQuota(auth.user.id, 'note_improvement');
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: 'Quota exceeded',
          message: quota.message,
          quota: { used: quota.used, limit: quota.limit, remaining: 0 },
        },
        { status: 429 }
      );
    }
    chargedUserId = auth.user.id;

    // 3. Build
    const { facts, guide, model } = await buildGuide(
      {
        title: article.title,
        journal: article.journal,
        year: article.year,
        studyKind: article.study_kind,
        sections: article.sections,
      },
      budget,
      aiCalls
    );
    await logAiCalls(auth.user.id, 'article_guide', aiCalls);
    aiCalls.length = 0; // logged

    // 4. Save (the sections are snapshotted so the guide's ids stay valid)
    const { data: saved, error } = await auth.db
      .from('article_guides')
      .insert({ article_read_id: article.id, budget_minutes: budget, sections: article.sections, facts, guide, model })
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) throw Object.assign(new Error('not set up'), { notSetUp: true });
      throw new Error(error.message);
    }
    if (article.status === 'to_read') {
      await auth.db.from('article_reads').update({ status: 'reading' }).eq('id', article.id);
    }

    return NextResponse.json({
      guide: saved,
      quota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
    });
  } catch (error) {
    console.error('Error building guide:', error);
    if (chargedUserId) {
      if (aiCalls.length > 0) await logAiCalls(chargedUserId, 'article_guide', aiCalls);
      const reason = error instanceof Error ? error.message : String(error);
      await refundQuota(chargedUserId, 'note_improvement', reason, 'article_guide');
    }
    if ((error as { notSetUp?: boolean }).notSetUp) return notSetUp();
    if (error instanceof GuideGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const { status, message } = toHttpError(error);
    return NextResponse.json({ error: `Couldn't build the guide: ${message}` }, { status });
  }
}
