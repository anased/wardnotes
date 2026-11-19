// src/lib/trials/searchCache.ts
// Supabase cache for trial name search (trial_search_cache). Server-side only.
// Failures are logged and ignored: the cache is an optimisation, never a dependency.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface SearchCache<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
}

export function supabaseSearchCache<T>(): SearchCache<T> {
  return {
    async get(key) {
      const db = getAdmin();
      if (!db) return null;
      try {
        const { data, error } = await db
          .from('trial_search_cache')
          .select('candidates')
          .eq('query_key', key)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (error) {
          console.error('Trial search cache read failed:', error.message);
          return null;
        }
        return (data?.candidates as T) ?? null;
      } catch (err) {
        console.error('Trial search cache read failed:', err);
        return null;
      }
    },
    async set(key, value) {
      const db = getAdmin();
      if (!db) return;
      try {
        const now = Date.now();
        const { error } = await db.from('trial_search_cache').upsert({
          query_key: key,
          candidates: value,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(now + SEARCH_CACHE_TTL_MS).toISOString(),
        });
        if (error) console.error('Trial search cache write failed:', error.message);
      } catch (err) {
        console.error('Trial search cache write failed:', err);
      }
    },
  };
}
