// src/app/api/trials/extract/route.ts
// Fill the trial form from an abstract: resolve PMID / DOI / PMCID / URL (or pasted
// abstract text) via PubMed, then extract the form fields with Claude.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { summarizeUsage, toHttpError } from '@/lib/ai/claude';
import { checkAndIncrementQuota, logApiUsage, refundQuota } from '@/lib/services/quotaService';
import {
  TrialSourceError,
  fetchPubmedArticle,
  parseTrialIdentifier,
  resolvePmid,
  type PubmedArticle,
} from '@/lib/trials/pubmed';
import { extractTrialFromAbstract } from '@/lib/trials/extractTrial';

export const maxDuration = 60;

const MAX_INPUT_LENGTH = 10_000;

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  try {
    // 1. Authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }

    // 2. Validate input and fetch the source BEFORE charging quota
    const body = (await request.json().catch(() => ({}))) as { source?: unknown };
    const raw = typeof body.source === 'string' ? body.source : '';
    if (!raw.trim()) {
      return NextResponse.json({ error: 'Enter a PMID, DOI, or PubMed/journal link' }, { status: 400 });
    }
    if (raw.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: `Input exceeds ${MAX_INPUT_LENGTH} characters` }, { status: 400 });
    }

    const identifier = parseTrialIdentifier(raw);
    if (!identifier) {
      return NextResponse.json(
        {
          error:
            "Couldn't recognise that. Enter a PMID (e.g. 29766750), a DOI, a PubMed or journal link, or paste the abstract.",
        },
        { status: 400 }
      );
    }

    let article: PubmedArticle | null = null;
    if (identifier.kind !== 'text') {
      try {
        article = await fetchPubmedArticle(await resolvePmid(identifier));
      } catch (err) {
        if (err instanceof TrialSourceError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    // 3. Quota check (shares the AI-assist quota with note improvement)
    const quotaCheck = await checkAndIncrementQuota(user.id, 'note_improvement');
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Quota exceeded',
          message: quotaCheck.message,
          quota: { used: quotaCheck.used, limit: quotaCheck.limit, remaining: 0 },
        },
        { status: 429 }
      );
    }
    // From here on the user has been charged; refund if anything fails
    chargedUserId = user.id;

    // 4. Extract with Claude
    const { trial, response } = await extractTrialFromAbstract(
      article
        ? { title: article.title, journal: article.journal, year: article.year, abstract: article.abstract }
        : { abstract: identifier.value }
    );

    const usage = summarizeUsage(response);
    await logApiUsage(user.id, 'note_improvement', usage.costUsd, usage.tokens, true);

    return NextResponse.json({
      trial: {
        ...trial,
        // Prefer PubMed's publication year over the model's reading of the text
        year: article?.year ?? trial.year,
      },
      source: article
        ? {
            pmid: article.pmid,
            title: article.title,
            journal: article.journal,
            year: article.year,
            doi: article.doi,
            url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
          }
        : null,
      quota: { used: quotaCheck.used, limit: quotaCheck.limit, remaining: quotaCheck.remaining },
    });
  } catch (error) {
    console.error('Error extracting trial:', error);
    const { status, message } = toHttpError(error);
    if (chargedUserId) {
      await refundQuota(chargedUserId, 'note_improvement', message);
    }
    return NextResponse.json({ error: `Failed to extract trial details: ${message}` }, { status });
  }
}
