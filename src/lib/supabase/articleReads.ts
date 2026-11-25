// Data access for the Deep Read Reading list (see migrations/add_article_reads.sql).
import { supabase, createNote, type Note } from './client';
import { saveNoteTopics } from './noteTopics';
import type { ArticleGuide, ArticleRead, GuideBudget, ReadStatus } from '@/lib/articles/types';
import { buildSummaryNoteContent, type CardDraft } from '@/lib/articles/note';
import type { NoteTopicLinkInput } from './types';

/** Columns for lists: everything but the (large) abstract and full text. */
const LIST_COLUMNS =
  'id, user_id, pmid, doi, pmcid, title, journal, year, publication_types, study_kind, full_text_source, pdf_path, status, primer, progress, note_id, trial_id, created_at, updated_at';

/** Newest first. */
export async function getArticleReads(): Promise<ArticleRead[]> {
  const { data, error } = await supabase
    .from('article_reads')
    .select(LIST_COLUMNS)
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

async function authHeader(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be logged in to do this');
  return `Bearer ${session.access_token}`;
}

/** POSTs JSON to a Deep Read route and throws the route's error message on failure. */
async function postJson<T>(url: string, payload: unknown = {}): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) {
    const message =
      response.status === 429 && body.message ? body.message : body.error || `Something went wrong (error ${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return body;
}

export interface AddArticleResult {
  article: ArticleRead;
  /** The user already had this article; nothing new was created. */
  existing: boolean;
}

/** Adds an article by PMID, DOI, PMC ID or link (POST /api/articles). */
export async function addArticle(source: string): Promise<AddArticleResult> {
  const response = await fetch('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
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

// ---------------------------------------------------------------------------
// Full text and guides (phase 2)

export const PDF_BUCKET = 'article-pdfs';
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Looks for free full text (PubMed Central, then Unpaywall). No AI, nothing charged. */
export async function findFullText(articleId: string): Promise<{ found: boolean; source?: string }> {
  return postJson(`/api/articles/${articleId}/full-text`);
}

/**
 * Uploads the user's PDF to their private folder, then has the server read it.
 * Throws the server's message for scans and unreadable files (the upload is deleted).
 */
export async function uploadArticlePdf(articleId: string, file: File): Promise<ArticleRead> {
  if (file.type && file.type !== 'application/pdf') throw new Error('Choose a PDF file.');
  if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is larger than 25 MB.');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be logged in to upload a PDF');
  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(`${user.id}/${articleId}.pdf`, file, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Couldn't upload the PDF: ${error.message}`);
  const { article } = await postJson<{ article: ArticleRead }>(`/api/articles/${articleId}/pdf`);
  return article;
}

/** Builds a guide (charged to the AI-assist quota). Takes a minute or two. */
export async function requestGuide(articleId: string, budget: GuideBudget): Promise<ArticleGuide> {
  const { guide } = await postJson<{ guide: ArticleGuide }>(`/api/articles/${articleId}/guide`, { budget });
  return guide;
}

/** The article's most recent guide, if any. */
export async function getLatestGuide(articleId: string): Promise<ArticleGuide | null> {
  const { data, error } = await supabase
    .from('article_guides')
    .select('*')
    .eq('article_read_id', articleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ArticleGuide) ?? null;
}

/**
 * The article's summary note: returns the one already saved (so saving twice never
 * makes two), or creates it from the primer and guide and links it to the article.
 */
export async function saveSummaryNote(
  article: ArticleRead,
  guide: ArticleGuide | null,
  topics: NoteTopicLinkInput[] = []
): Promise<{ noteId: string; created: boolean }> {
  if (article.note_id) {
    const { data } = await supabase.from('notes').select('id').eq('id', article.note_id).maybeSingle();
    if (data) {
      if (topics.length) await saveNoteTopics(article.note_id, topics);
      return { noteId: article.note_id, created: false };
    }
  }
  const note: Note = await createNote({
    title: article.title.slice(0, 500),
    content: buildSummaryNoteContent(article, guide?.guide ?? null) as unknown as Record<string, unknown>,
    tags: [],
    content_type: 'article',
  });
  if (topics.length) await saveNoteTopics(note.id, topics);
  const { error } = await supabase.from('article_reads').update({ note_id: note.id }).eq('id', article.id);
  if (error) throw error;
  return { noteId: note.id, created: true };
}

/** Saves chosen cards to a deck through the existing preview-save route. */
export async function saveArticleFlashcards(noteId: string, deckId: string, cards: CardDraft[]): Promise<number> {
  const { flashcards } = await postJson<{ flashcards: unknown[] }>('/api/flashcards/save-preview', {
    cards,
    deck_id: deckId,
    note_id: noteId,
    card_type: 'front_back',
  });
  return flashcards?.length ?? 0;
}

/** Links a trial record to the article (set after the trial form saves). */
export async function setArticleTrial(articleId: string, trialId: string): Promise<void> {
  const { error } = await supabase.from('article_reads').update({ trial_id: trialId }).eq('id', articleId);
  if (error) throw error;
}
