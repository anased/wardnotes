// Data access for topics (see migrations/add_topics.sql).
import { supabase } from './client';
import type { TopicEdgeRow, TopicRow, TopicSearchResult } from './types';

export type Topic = TopicRow;
export type TopicEdge = Pick<TopicEdgeRow, 'parent_id' | 'child_id'>;

export interface TopicInput {
  name: string;
  aliases: string[];
  description: string | null;
  parentIds: string[];
}

/** Turns database errors into messages a user can act on. */
export function topicErrorMessage(err: unknown, name?: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') {
    return name ? `A topic named "${name}" already exists.` : 'A topic with this name already exists.';
  }
  if (e?.code === '23514' && e.message?.includes('cannot be placed under')) {
    return 'A topic cannot be placed under itself or one of its subtopics.';
  }
  if (e?.code === '23514') return 'Topic names must be 1–120 characters.';
  return e?.message || 'Something went wrong. Please try again.';
}

export async function getTopics(): Promise<Topic[]> {
  const { data, error } = await supabase.from('topics').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Topic[];
}

export async function getTopicEdges(): Promise<TopicEdge[]> {
  const { data, error } = await supabase.from('topic_edges').select('parent_id, child_id');
  if (error) throw error;
  return (data ?? []) as TopicEdge[];
}

/** Notes linked directly to each topic, keyed by topic id. */
export async function getTopicNoteCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('topic_note_counts');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { topic_id: string; note_count: number }[]) {
    counts[row.topic_id] = row.note_count;
  }
  return counts;
}

/** Server-side name/alias search (the picker normally matches locally). */
export async function searchTopics(query: string, limit = 20): Promise<TopicSearchResult[]> {
  const { data, error } = await supabase.rpc('search_topics', { p_query: query, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as TopicSearchResult[];
}

/** Makes the topic's parents exactly `parentIds` (adds and removes edges). */
export async function setTopicParents(topicId: string, parentIds: string[], currentParentIds: string[]) {
  const toRemove = currentParentIds.filter((p) => !parentIds.includes(p));
  const toAdd = parentIds.filter((p) => !currentParentIds.includes(p));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('topic_edges')
      .delete()
      .eq('child_id', topicId)
      .in('parent_id', toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('topic_edges')
      .insert(toAdd.map((parent_id) => ({ parent_id, child_id: topicId })));
    if (error) throw error;
  }
}

export async function createTopic(input: TopicInput): Promise<Topic> {
  const { data, error } = await supabase
    .from('topics')
    .insert({ name: input.name, aliases: input.aliases, description: input.description })
    .select()
    .single();
  if (error) throw error;
  const topic = data as Topic;

  if (input.parentIds.length > 0) {
    try {
      await setTopicParents(topic.id, input.parentIds, []);
    } catch (err) {
      // Don't leave a half-created topic behind.
      await supabase.from('topics').delete().eq('id', topic.id);
      throw err;
    }
  }
  return topic;
}

export async function updateTopic(id: string, input: TopicInput, currentParentIds: string[]): Promise<Topic> {
  const { data, error } = await supabase
    .from('topics')
    .update({ name: input.name, aliases: input.aliases, description: input.description })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await setTopicParents(id, input.parentIds, currentParentIds);
  return data as Topic;
}

/** Deletes a topic. Its notes stay; their links to it (and its sections) go. */
export async function deleteTopic(id: string) {
  const { error } = await supabase.from('topics').delete().eq('id', id);
  if (error) throw error;
}
