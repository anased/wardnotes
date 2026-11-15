// Labeled links between notes and trials (note_links table).
import { supabase } from './client';
import type { LinkEndpointType, LinkRelation, NoteLinkRow } from './types';
import type { LinkDraft } from '../utils/noteLinks';
import { diffOutgoingLinks } from '../utils/noteLinks';

export type NoteLink = NoteLinkRow;

/** Minimal note fields for showing the other end of a link. */
export interface LinkedNoteSummary {
  id: string;
  title: string;
  content_type: string | null;
  status: string;
}

export function linkErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'That link already exists.';
  if (e?.code === '23503') return 'The linked note or trial no longer exists.';
  return e?.message || 'Something went wrong. Please try again.';
}

/** Every link where the item is the source or the target. */
export async function getLinksFor(type: LinkEndpointType, id: string): Promise<NoteLink[]> {
  const [outgoing, incoming] = await Promise.all([
    supabase.from('note_links').select('*').eq('source_type', type).eq('source_id', id).order('created_at'),
    supabase.from('note_links').select('*').eq('target_type', type).eq('target_id', id).order('created_at'),
  ]);
  if (outgoing.error) throw outgoing.error;
  if (incoming.error) throw incoming.error;
  return [...(outgoing.data ?? []), ...(incoming.data ?? [])] as NoteLink[];
}

/** Links that start at the item (what the editor manages). */
export async function getOutgoingLinks(type: LinkEndpointType, id: string): Promise<NoteLink[]> {
  const { data, error } = await supabase
    .from('note_links')
    .select('*')
    .eq('source_type', type)
    .eq('source_id', id)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as NoteLink[];
}

export async function createLink(
  source: { type: LinkEndpointType; id: string },
  target: { type: LinkEndpointType; id: string },
  relation: LinkRelation
): Promise<NoteLink> {
  const { data, error } = await supabase
    .from('note_links')
    .insert({ source_type: source.type, source_id: source.id, target_type: target.type, target_id: target.id, relation })
    .select()
    .single();
  if (error) throw error;
  return data as NoteLink;
}

export async function deleteLink(id: string) {
  const { error } = await supabase.from('note_links').delete().eq('id', id);
  if (error) throw error;
}

/** Makes the note's outgoing links match `wanted` (creates and deletes as needed). */
export async function saveOutgoingNoteLinks(noteId: string, wanted: LinkDraft[]) {
  const current = await getOutgoingLinks('note', noteId);
  const { create, remove } = diffOutgoingLinks(current, wanted);
  if (remove.length > 0) {
    const { error } = await supabase.from('note_links').delete().in('id', remove.map((l) => l.id));
    if (error) throw error;
  }
  if (create.length > 0) {
    const { error } = await supabase.from('note_links').insert(
      create.map((d) => ({
        source_type: 'note' as const,
        source_id: noteId,
        target_type: d.target_type,
        target_id: d.target_id,
        relation: d.relation,
      }))
    );
    if (error) throw error;
  }
}

/** Titles (and type/status) of the given notes. */
export async function getNoteSummaries(ids: string[]): Promise<Record<string, LinkedNoteSummary>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from('notes').select('id, title, content_type, status').in('id', ids);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as LinkedNoteSummary[]).map((n) => [n.id, n]));
}

/** Notes whose title contains the query (recent notes when it's empty). */
export async function searchNoteSummaries(query: string, limit = 20): Promise<LinkedNoteSummary[]> {
  let q = supabase.from('notes').select('id, title, content_type, status');
  const term = query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  if (term) q = q.ilike('title', `%${term}%`);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as LinkedNoteSummary[];
}
