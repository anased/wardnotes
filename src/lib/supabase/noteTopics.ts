// A note's links to topics (see set_note_topics in migrations/add_topics.sql).
import { supabase } from './client';
import type { NoteTopicLinkInput } from './types';

/** The note's topic links, primary first. */
export async function getNoteTopicLinks(noteId: string): Promise<NoteTopicLinkInput[]> {
  const { data, error } = await supabase
    .from('note_topics')
    .select('topic_id, section_id, is_primary, created_at')
    .eq('note_id', noteId)
    .order('is_primary', { ascending: false })
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as (NoteTopicLinkInput & { created_at: string })[]).map(
    ({ topic_id, section_id, is_primary }) => ({ topic_id, section_id, is_primary })
  );
}

/** Replaces the note's topic links in one transaction; the database keeps exactly one primary. */
export async function saveNoteTopics(noteId: string, links: NoteTopicLinkInput[]) {
  const { error } = await supabase.rpc('set_note_topics', { p_note_id: noteId, p_links: links });
  if (error) throw error;
}

export interface NoteTopicDisplay {
  topic_id: string;
  is_primary: boolean;
  section_name: string | null;
}

/** The note's topics with section names, primary first (for the note view). */
export async function getNoteTopicsForDisplay(noteId: string): Promise<NoteTopicDisplay[]> {
  const { data, error } = await supabase
    .from('note_topics')
    .select('topic_id, is_primary, created_at, section:topic_sections(name)')
    .eq('note_id', noteId)
    .order('is_primary', { ascending: false })
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as unknown as { topic_id: string; is_primary: boolean; section: { name: string } | null }[]).map(
    (row) => ({ topic_id: row.topic_id, is_primary: row.is_primary, section_name: row.section?.name ?? null })
  );
}
