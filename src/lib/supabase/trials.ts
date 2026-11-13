// Data access for shared trial records (see migrations/add_topics.sql).
import { supabase } from './client';
import type { TrialInsert, TrialRow, TrialTopicLinkInput } from './types';

export type Trial = TrialRow;
export type TrialInput = Omit<TrialInsert, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface TrialTopicLink {
  topic_id: string;
  section_id: string | null;
}

/** A trial linked to a topic, with its section in that topic. */
export interface TopicTrialLink {
  trial: Trial;
  section_id: string | null;
}

export function trialErrorMessage(err: unknown, label?: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return `${label ? `"${label}"` : 'This trial'} already exists.`;
  if (e?.code === '23514') return 'Check the acronym (1–60 characters) and year (1900–2100).';
  return e?.message || 'Something went wrong. Please try again.';
}

export async function getTrials(): Promise<Trial[]> {
  const { data, error } = await supabase.from('trials').select('*').order('acronym');
  if (error) throw error;
  return (data ?? []) as Trial[];
}

export async function getTrial(id: string): Promise<Trial | null> {
  const { data, error } = await supabase.from('trials').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Trial) ?? null;
}

export async function createTrial(input: TrialInput, topics: TrialTopicLink[]): Promise<Trial> {
  const { data, error } = await supabase.from('trials').insert(input).select().single();
  if (error) throw error;
  const trial = data as Trial;
  if (topics.length > 0) await setTrialTopics(trial.id, topics);
  return trial;
}

export async function updateTrial(id: string, input: TrialInput, topics?: TrialTopicLink[]): Promise<Trial> {
  const { data, error } = await supabase.from('trials').update(input).eq('id', id).select().single();
  if (error) throw error;
  if (topics) await setTrialTopics(id, topics);
  return data as Trial;
}

/** Deletes a trial; its topic links and note links go with it. */
export async function deleteTrial(id: string) {
  const { error } = await supabase.from('trials').delete().eq('id', id);
  if (error) throw error;
}

export async function getTrialTopics(trialId: string): Promise<TrialTopicLink[]> {
  const { data, error } = await supabase
    .from('trial_topics')
    .select('topic_id, section_id')
    .eq('trial_id', trialId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as TrialTopicLink[];
}

/** Replaces the trial's topic links in one transaction. */
export async function setTrialTopics(trialId: string, links: TrialTopicLinkInput[]) {
  const { error } = await supabase.rpc('set_trial_topics', { p_trial_id: trialId, p_links: links });
  if (error) throw error;
}

/** Trials linked to a topic, by acronym. */
export async function getTopicTrials(topicId: string): Promise<TopicTrialLink[]> {
  const { data, error } = await supabase
    .from('trial_topics')
    .select('section_id, trial:trials!trial_topics_trial_fkey(*)')
    .eq('topic_id', topicId);
  if (error) throw error;
  return ((data ?? []) as unknown as TopicTrialLink[])
    .filter((row) => row.trial)
    .sort((a, b) => a.trial.acronym.localeCompare(b.trial.acronym, undefined, { sensitivity: 'base' }));
}

/** Links a trial to a topic (no-op when already linked). */
export async function linkTrialToTopic(trialId: string, topicId: string, sectionId: string | null = null) {
  const { error } = await supabase
    .from('trial_topics')
    .upsert({ trial_id: trialId, topic_id: topicId, section_id: sectionId }, { onConflict: 'trial_id,topic_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlinkTrialFromTopic(trialId: string, topicId: string) {
  const { error } = await supabase.from('trial_topics').delete().eq('trial_id', trialId).eq('topic_id', topicId);
  if (error) throw error;
}

export async function moveTrialToSection(trialId: string, topicId: string, sectionId: string | null) {
  const { error } = await supabase
    .from('trial_topics')
    .update({ section_id: sectionId })
    .eq('trial_id', trialId)
    .eq('topic_id', topicId);
  if (error) throw error;
}

/** Topic ids each trial is linked to, keyed by trial id (for list views). */
export async function getAllTrialTopicIds(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('trial_topics').select('trial_id, topic_id');
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const row of (data ?? []) as { trial_id: string; topic_id: string }[]) {
    (out[row.trial_id] ||= []).push(row.topic_id);
  }
  return out;
}

/** The trial's topics with section names (for the trial page). */
export async function getTrialTopicsForDisplay(
  trialId: string
): Promise<{ topic_id: string; section_name: string | null }[]> {
  const { data, error } = await supabase
    .from('trial_topics')
    .select('topic_id, created_at, section:topic_sections(name)')
    .eq('trial_id', trialId)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as unknown as { topic_id: string; section: { name: string } | null }[]).map((r) => ({
    topic_id: r.topic_id,
    section_name: r.section?.name ?? null,
  }));
}
