// Data access for the Deep Read Reading list (see migrations/add_article_reads.sql).
import { supabase } from './client';
import type { ArticleRead, ReadStatus } from '@/lib/articles/types';

/** Newest first. */
export async function getArticleReads(): Promise<ArticleRead[]> {
  const { data, error } = await supabase
    .from('article_reads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArticleRead[];
}

export async function getArticleRead(id: string): Promise<ArticleRead | null> {
  const { data, error } = await supabase.from('article_reads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ArticleRead) ?? null;
}

export async function setArticleStatus(id: string, status: ReadStatus): Promise<ArticleRead> {
  const { data, error } = await supabase.from('article_reads').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data as ArticleRead;
}

export async function deleteArticleRead(id: string): Promise<void> {
  const { error } = await supabase.from('article_reads').delete().eq('id', id);
  if (error) throw error;
}

/** Articles still marked "To read" (the Reading tab's badge). */
export async function countToRead(): Promise<number> {
  const { count, error } = await supabase
    .from('article_reads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'to_read');
  if (error) throw error;
  return count ?? 0;
}

export interface AddArticleResult {
  article: ArticleRead;
  /** The user already had this article; nothing new was created. */
  existing: boolean;
}

/** Adds an article by PMID, DOI, PMC ID or link (POST /api/articles). */
export async function addArticle(source: string): Promise<AddArticleResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be logged in to add articles');
  const response = await fetch('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ source }),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<AddArticleResult> & { error?: string };
  if (!response.ok || !body.article) {
    throw new Error(body.error || `Couldn't add the article (error ${response.status}).`);
  }
  return { article: body.article, existing: !!body.existing };
}

/** Lets the Reading tab's badge refresh when the list changes on this page. */
export const READING_CHANGED_EVENT = 'wardnotes:reading-changed';

export function notifyReadingChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(READING_CHANGED_EVENT));
}
