// src/app/api/articles/route.ts
// Deep Read intake: add an article to the user's Reading list by PMID, DOI, PMC ID or
// link. Fetches the PubMed record, classifies the study and writes the primer, then
// saves the user's copy (article_reads). See docs/deep-read-plan.md.
//
// The primer is free (no quota charge) but logged as `article_primer` and capped per
// day. Metadata and primers are cached per PMID across users (article_cache), so an
// article someone has already added costs nothing.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toHttpError } from '@/lib/ai/claude';
import type { AiCallRecord } from '@/lib/ai/usage';
import { logAiCalls } from '@/lib/services/quotaService';
import { TrialSourceError, parseTrialIdentifier, resolvePmid } from '@/lib/trials/pubmed';
import { primerDailyLimit, primersGeneratedToday, supabaseArticleCache } from '@/lib/articles/cache';
import { classifyStudy } from '@/lib/articles/classify';
import { PrimerRateLimitError, getArticleSummary } from '@/lib/articles/summary';
import type { ArticleRead } from '@/lib/articles/types';

export const maxDuration = 60;

const MAX_INPUT_LENGTH = 2_000;

/** Postgres/PostgREST codes for a table that doesn't exist yet. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function notSetUp() {
  return NextResponse.json(
    { error: "The Reading list isn't set up yet. Apply the add_article_reads.sql migration." },
    { status: 503 }
  );
}

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  const aiCalls: AiCallRecord[] = [];
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
    const db = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
    }
    userId = user.id;

    // 2. Validate input
    const body = (await request.json().catch(() => ({}))) as { source?: unknown };
    const raw = typeof body.source === 'string' ? body.source.trim() : '';
    if (!raw) {
      return NextResponse.json({ error: 'Enter a PMID, DOI, or PubMed/journal link' }, { status: 400 });
    }
    if (raw.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: 'That link is too long.' }, { status: 400 });
    }
    const identifier = parseTrialIdentifier(raw);
    if (!identifier || identifier.kind === 'text') {
      return NextResponse.json(
        {
          error:
            "Couldn't recognise that. Enter a PMID (e.g. 29766750), a DOI, a PMC ID, or a PubMed or journal link.",
        },
        { status: 400 }
      );
    }

    // 3. Resolve to a PMID; if the user already has this article, reopen it
    const pmid = await resolvePmid(identifier);
    const existing = await db.from('article_reads').select('*').eq('pmid', pmid).maybeSingle();
    if (existing.error) {
      if (MISSING_TABLE_CODES.has(existing.error.code)) return notSetUp();
      throw new Error(existing.error.message);
    }
    if (existing.data) {
      return NextResponse.json({ article: existing.data as ArticleRead, existing: true });
    }

    // 4. Metadata + primer (cache first; the model only on a miss, rate-limited)
    const limit = primerDailyLimit();
    const { metadata, primer, primerCached } = await getArticleSummary(
      pmid,
      {
        cache: supabaseArticleCache(),
        checkRateLimit: async () => {
          if ((await primersGeneratedToday(user.id)) >= limit) throw new PrimerRateLimitError(limit);
        },
      },
      aiCalls
    );
    if (!primerCached) await logAiCalls(user.id, 'article_primer', aiCalls);
    aiCalls.length = 0; // logged; don't log again if saving fails

    // 5. Save the user's copy
    const row = {
      pmid: metadata.pmid,
      doi: metadata.doi,
      pmcid: metadata.pmcid,
      title: metadata.title,
      journal: metadata.journal,
      year: metadata.year,
      abstract: metadata.abstract,
      publication_types: metadata.publicationTypes,
      study_kind: classifyStudy(metadata.publicationTypes),
      primer,
    };
    const inserted = await db.from('article_reads').insert(row).select().single();
    if (inserted.error) {
      // Added twice at once (e.g. a double tap): return the row that won.
      if (inserted.error.code === '23505') {
        const again = await db.from('article_reads').select('*').eq('pmid', pmid).single();
        if (!again.error) return NextResponse.json({ article: again.data as ArticleRead, existing: true });
      }
      if (MISSING_TABLE_CODES.has(inserted.error.code)) return notSetUp();
      throw new Error(inserted.error.message);
    }

    return NextResponse.json({ article: inserted.data as ArticleRead, existing: false }, { status: 201 });
  } catch (error) {
    if (error instanceof TrialSourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PrimerRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('Error adding article:', error);
    // Log calls already made before the failure (nothing was charged to quota).
    if (userId && aiCalls.length > 0) await logAiCalls(userId, 'article_primer', aiCalls);
    const { status, message } = toHttpError(error);
    return NextResponse.json({ error: `Couldn't add the article: ${message}` }, { status });
  }
}
