// Data access for a topic's sections and the notes filed under it.
import { supabase, Note } from './client';
import type { TopicSectionRow } from './types';

export type TopicSection = TopicSectionRow;

/** A note filed under a topic, with its section in that topic. */
export interface TopicNoteLink {
  note: Note;
  section_id: string | null;
  /** True when this topic is the note's primary topic. */
  is_primary: boolean;
}

/** Suggestions offered by "Add section"; any custom name is allowed too. */
export const SECTION_SUGGESTIONS = [
  'Overview',
  'Pathophysiology',
  'Diagnosis',
  'Management',
  'Trials and evidence',
  'Articles',
  'Clinical questions',
  'Cases',
  'Pearls and pitfalls',
  'Algorithms',
] as const;

export function sectionErrorMessage(err: unknown, name?: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') {
    return name ? `This topic already has a section called "${name}".` : 'This topic already has that section.';
  }
  if (e?.code === '23514') return 'Section names must be 1–80 characters.';
  return e?.message || 'Something went wrong. Please try again.';
}

export async function getTopicSections(topicId: string): Promise<TopicSection[]> {
  const { data, error } = await supabase
    .from('topic_sections')
    .select('*')
    .eq('topic_id', topicId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as TopicSection[];
}

export async function createSection(topicId: string, name: string, sortOrder: number): Promise<TopicSection> {
  const { data, error } = await supabase
    .from('topic_sections')
    .insert({ topic_id: topicId, name, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as TopicSection;
}

export async function renameSection(id: string, name: string): Promise<TopicSection> {
  const { data, error } = await supabase.from('topic_sections').update({ name }).eq('id', id).select().single();
  if (error) throw error;
  return data as TopicSection;
}

/** Deletes a section; its notes stay on the topic under "Unsorted". */
export async function deleteSection(id: string) {
  const { error } = await supabase.from('topic_sections').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderSections(topicId: string, sectionIds: string[]) {
  const { error } = await supabase.rpc('reorder_topic_sections', {
    p_topic_id: topicId,
    p_section_ids: sectionIds,
  });
  if (error) throw error;
}

/** Notes filed directly under a topic, newest first. */
export async function getTopicNotes(topicId: string): Promise<TopicNoteLink[]> {
  const { data, error } = await supabase
    .from('note_topics')
    .select('section_id, is_primary, note:notes(*)')
    .eq('topic_id', topicId);
  if (error) throw error;
  return ((data ?? []) as unknown as TopicNoteLink[])
    .filter((row) => row.note)
    .sort((a, b) => b.note.created_at.localeCompare(a.note.created_at));
}

/** Primary topic id of each given note. */
export async function getPrimaryTopicIds(noteIds: string[]): Promise<Record<string, string>> {
  if (noteIds.length === 0) return {};
  const { data, error } = await supabase
    .from('note_topics')
    .select('note_id, topic_id')
    .in('note_id', noteIds)
    .eq('is_primary', true);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { note_id: string; topic_id: string }[]) out[row.note_id] = row.topic_id;
  return out;
}

/** Files a note under a section of the topic (null = Unsorted). */
export async function moveNoteToSection(noteId: string, topicId: string, sectionId: string | null) {
  const { error } = await supabase
    .from('note_topics')
    .update({ section_id: sectionId })
    .eq('note_id', noteId)
    .eq('topic_id', topicId);
  if (error) throw error;
}
