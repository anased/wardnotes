// src/lib/articles/cache.ts
// Shared per-PMID cache (article_cache): PubMed metadata and primers are the same for
// every user, so each is fetched or generated once. Server-side only.
// [trust] Only public data goes in here: never an upload, a guide or anything personal.
// Failures are logged and ignored: the cache is an optimisation, never a dependency.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ArticleMetadata, Primer } from './types';

/** How long PubMed metadata is trusted before it's fetched again. */
export const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface CachedArticle {
  metadata: ArticleMetadata;
  /** False once expires_at has passed: refetch the metadata, but the primer may still be reused. */
  fresh: boolean;
  primer: Primer | null;
  primerVersion: string | null;
}

export interface ArticleCache {
  get(pmid: string): Promise<CachedArticle | null>;
  put(metadata: ArticleMetadata, primer: Primer | null, primerVersion: string | null): Promise<void>;
}

export function supabaseArticleCache(): ArticleCache {
  return {
    async get(pmid) {
      const db = getAdmin();
      if (!db) return null;
      try {
        const { data, error } = await db
          .from('article_cache')
          .select('metadata, primer, primer_version, expires_at')
          .eq('pmid', pmid)
          .maybeSingle();
        if (error) {
          console.error('Article cache read failed:', error.message);
          return null;
        }
        if (!data) return null;
        return {
          metadata: data.metadata as ArticleMetadata,
          fresh: new Date(data.expires_at as string).getTime() > Date.now(),
          primer: (data.primer as Primer | null) ?? null,
          primerVersion: (data.primer_version as string | null) ?? null,
        };
      } catch (err) {
        console.error('Article cache read failed:', err);
        return null;
      }
    },
    async put(metadata, primer, primerVersion) {
      const db = getAdmin();
      if (!db) return;
      try {
        const now = Date.now();
        const { error } = await db.from('article_cache').upsert({
          pmid: metadata.pmid,
          metadata,
          primer,
          primer_version: primer ? primerVersion : null,
          updated_at: new Date(now).toISOString(),
          expires_at: new Date(now + METADATA_TTL_MS).toISOString(),
        });
        if (error) console.error('Article cache write failed:', error.message);
      } catch (err) {
        console.error('Article cache write failed:', err);
      }
    },
  };
}

/**
 * Daily cap on primers a user can trigger that actually call the model (cache hits
 * are free and uncounted). Counts successful article_primer rows in api_usage_logs
 * over the last 24 hours. If the count can't be read, the user is let through.
 */
export const DEFAULT_PRIMER_DAILY_LIMIT = 50;

export function primerDailyLimit(): number {
  const raw = Number(process.env.ARTICLE_PRIMER_DAILY_LIMIT);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_PRIMER_DAILY_LIMIT;
}

export async function primersGeneratedToday(userId: string): Promise<number> {
  const db = getAdmin();
  if (!db) return 0;
  try {
    const { count, error } = await db
      .from('api_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature_type', 'article_primer')
      .eq('success', true)
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (error) {
      console.error('Primer rate-limit count failed:', error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error('Primer rate-limit count failed:', err);
    return 0;
  }
}
