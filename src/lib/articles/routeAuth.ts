// src/lib/articles/routeAuth.ts
// Shared plumbing for the Deep Read API routes. Server-side only.
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { ArticleRead } from './types';

/** Postgres/PostgREST codes for a table or column that doesn't exist yet. */
const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);

export function isMissingSchema(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_SCHEMA_CODES.has(error.code);
}

export function notSetUp(migration = 'add_article_reads.sql') {
  return NextResponse.json(
    { error: `The Reading list isn't fully set up yet. Apply the ${migration} migration.` },
    { status: 503 }
  );
}

export interface AuthedRequest {
  db: SupabaseClient;
  user: User;
}

/** A Supabase client acting as the signed-in user (RLS applies), or a 401 response. */
export async function authenticate(request: NextRequest): Promise<AuthedRequest | NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized - no valid Authorization header' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) throw new Error('Missing Supabase environment variables');
  const db = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Authentication error - invalid token' }, { status: 401 });
  }
  return { db, user };
}

/** The user's article (RLS-scoped), or a 404/503 response. */
export async function loadArticle(db: SupabaseClient, id: string): Promise<ArticleRead | NextResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  const { data, error } = await db.from('article_reads').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return notSetUp();
    throw new Error(error.message);
  }
  if (!data) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  return data as ArticleRead;
}

export const PDF_BUCKET = 'article-pdfs';

/** Where a user's PDF for an article lives in storage. */
export function pdfObjectPath(userId: string, articleId: string): string {
  return `${userId}/${articleId}.pdf`;
}
