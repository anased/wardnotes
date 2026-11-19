// src/app/api/trials/search/route.ts
// Find a trial's publications by name/acronym or NCT number, using only free public
// APIs (PubMed + ClinicalTrials.gov) and a Supabase cache. No LLM and no quota charge;
// picking a candidate sends its PMID to /api/trials/extract.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { TrialSourceError } from '@/lib/trials/errors';
import { detectTrialQuery } from '@/lib/trials/identify';
import { supabaseSearchCache } from '@/lib/trials/searchCache';
import { searchTrials, type TrialSearchResult } from '@/lib/trials/searchTrials';

export const maxDuration = 30;

const cache = supabaseSearchCache<TrialSearchResult>();

export async function POST(request: NextRequest) {
  try {
    // Signed-in users only: keeps the NCBI/registry rate budget for the app's users.
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

    const body = (await request.json().catch(() => ({}))) as { query?: unknown };
    const raw = typeof body.query === 'string' ? body.query : '';
    const query = detectTrialQuery(raw);
    if (!query) {
      return NextResponse.json({ error: 'Enter a trial name (e.g. POINT), an NCT number, a PMID, or a DOI.' }, { status: 400 });
    }
    if (query.kind !== 'name' && query.kind !== 'nct') {
      // PMIDs, DOIs, links and abstracts go straight to extraction.
      return NextResponse.json(
        { error: 'That looks like a PMID, DOI, or abstract. Use Extract instead.', kind: query.kind },
        { status: 400 }
      );
    }

    const result = await searchTrials(query, cache);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrialSourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error searching trials:', error);
    return NextResponse.json({ error: 'Trial search failed. Please try again.' }, { status: 500 });
  }
}
