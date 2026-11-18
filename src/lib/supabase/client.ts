// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { hasTag, normalizeTagName, validateTagName } from '../utils/tagUtils';
import type { ContentType, NoteStatus } from '../utils/noteFields';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database tables
export type Note = {
  id: string;
  user_id: string;
  title: string;
  content: Record<string, unknown>; // TipTap JSON content
  tags: string[];
  /** 'unanswered' marks an open question; everything else is 'answered'. */
  status: NoteStatus;
  /** What kind of note this is (question, article, trial, ...), if set. */
  content_type: ContentType | null;
  created_at: string;
  /** The note's topic links, when the query embeds them (see NOTE_SELECT). */
  note_topics?: NoteTopicRef[];
};

export type NoteTopicRef = { topic_id: string; is_primary: boolean };

/**
 * Columns read for notes everywhere in the app: the row plus its topic links,
 * so lists can show the specialty (root of the primary topic) without
 * another round trip.
 */
export const NOTE_SELECT = '*, note_topics(topic_id,is_primary)';

/** Fields a caller provides when creating a note; status/type default in the database. */
export type NoteInput = Omit<Note, 'id' | 'user_id' | 'created_at' | 'status' | 'content_type' | 'note_topics'> &
  Partial<Pick<Note, 'status' | 'content_type'>>;

/** Columns a caller may change on a note. */
export type NoteUpdate = Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'note_topics'>>;

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

// ======================
// Note Operations
// ======================

// Get all notes for the current user
export const getNotes = async () => {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_SELECT)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }

  return data as Note[];
};

// Get a single note by ID
export const getNoteById = async (id: string) => {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching note by ID:', error);
    throw error;
  }

  return data as Note;
};

// Create a new note
export const createNote = async (note: NoteInput) => {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  // Add the user_id to the note
  const noteWithUser = {
    ...note,
    user_id: user.id
  };
  
  const { data, error } = await supabase
    .from('notes')
    .insert(noteWithUser)
    .select(NOTE_SELECT);

  if (error) {
    console.error('Error creating note:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    throw new Error('Failed to create note - no data returned');
  }

  return data[0] as Note;
};

// Update an existing note
export const updateNote = async (id: string, note: NoteUpdate) => {
  const { data, error } = await supabase
    .from('notes')
    .update(note)
    .eq('id', id)
    .select(NOTE_SELECT)
    .single();

  if (error) {
    console.error('Error updating note:', error);
    throw error;
  }

  return data as Note;
};

// Delete a note
export const deleteNote = async (id: string) => {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting note:', error);
    throw error;
  }

  return true;
};

// Search notes by text
export const searchNotes = async (query: string) => {
  const { data, error } = await supabase
    .rpc('search_notes', { search_query: query })
    .select(NOTE_SELECT);

  if (error) {
    console.error('Error searching notes:', error);
    throw error;
  }

  return data as Note[];
};

export type NoteFilters = {
  /** Text search (see search_notes); the other filters narrow its results. */
  query?: string;
  /** Notes must have ALL of these tags. */
  tags?: string[];
  status?: NoteStatus;
  contentType?: ContentType;
  /** Topic id: notes filed under this topic or any of its subtopics. */
  topicId?: string;
};

// Filter notes by text search, topic, tags, status and/or content type; all
// given filters must match. Tag matching is AND: a note must carry every
// selected tag. Tag names are canonical in the database, so an exact array
// containment check is enough.
export const filterNotes = async ({ query: text, tags = [], status, contentType, topicId }: NoteFilters) => {
  const q = text?.trim() || '';
  // search_notes and notes_in_topic return notes rows, so the filters below
  // still apply to them. Both together can't be one query: the topic's note
  // ids are fetched alongside and intersected below.
  let query = q
    ? supabase.rpc('search_notes', { search_query: q })
    : topicId
      ? supabase.rpc('notes_in_topic', { p_topic_id: topicId })
      : supabase.from('notes').select();
  const topicIdsRequest =
    q && topicId ? supabase.rpc('notes_in_topic', { p_topic_id: topicId }).select('id') : null;

  if (tags.length > 0) {
    query = query.contains('tags', tags);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (contentType) {
    query = query.eq('content_type', contentType);
  }

  // select() last: on an rpc call it would hide the filter methods (types only)
  const [{ data, error }, topicResult] = await Promise.all([
    query.select(NOTE_SELECT).order('created_at', { ascending: false }),
    topicIdsRequest,
  ]);

  if (error || topicResult?.error) {
    console.error('Error filtering notes:', error || topicResult?.error);
    throw error || topicResult?.error;
  }

  const notes = data as Note[];
  if (!topicResult) return notes;
  const inTopic = new Set((topicResult.data as { id: string }[]).map((r) => r.id));
  return notes.filter((n) => inTopic.has(n.id));
};

/** True when the user has at least one note of this type (e.g. the retired 'trial'). */
export const hasNotesOfType = async (contentType: ContentType) => {
  const { count, error } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', contentType);
  if (error) {
    console.error('Error counting notes by type:', error);
    throw error;
  }
  return (count ?? 0) > 0;
};

// Fetch notes that could be related to `note`: any that share a label (tag),
// plus notes filed under `topicIds` (the note's topics and the topics near
// them; see relatedTopicIds). Ranking happens client-side (see
// rankRelatedNotes); this only narrows the candidate pool.
export const getRelatedNoteCandidates = async (
  note: Pick<Note, 'id' | 'tags'>,
  topicIds: string[],
  { tagLimit = 50, topicLimit = 60 }: { tagLimit?: number; topicLimit?: number } = {}
) => {
  const tags = (note.tags || []).filter(Boolean);

  const byTags = tags.length
    ? supabase
        .from('notes')
        .select(NOTE_SELECT)
        .overlaps('tags', tags)
        .neq('id', note.id)
        .order('created_at', { ascending: false })
        .limit(tagLimit)
    : null;

  const byTopics = async () => {
    if (topicIds.length === 0) return { data: [] as Note[], error: null };
    const links = await supabase
      .from('note_topics')
      .select('note_id')
      .in('topic_id', topicIds)
      .neq('note_id', note.id)
      .limit(500);
    if (links.error) return { data: null, error: links.error };
    const ids = [...new Set((links.data ?? []).map((l: { note_id: string }) => l.note_id))];
    if (ids.length === 0) return { data: [] as Note[], error: null };
    return supabase
      .from('notes')
      .select(NOTE_SELECT)
      .in('id', ids)
      .order('created_at', { ascending: false })
      .limit(topicLimit);
  };

  const [tagResult, topicResult] = await Promise.all([byTags, byTopics()]);

  const error = tagResult?.error || topicResult?.error;
  if (error) {
    console.error('Error fetching related notes:', error);
    throw error;
  }

  return [
    ...((topicResult?.data as Note[] | null) ?? []),
    ...((tagResult?.data as Note[] | null) ?? []),
  ];
};

// ======================
// Tag Operations
// ======================

// Get all tags for the current user
export const getTags = async () => {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }

  return data as Tag[];
};

// Create a new tag
export const createTag = async (name: string) => {
  const validationError = validateTagName(name);
  if (validationError) {
    throw new Error(validationError);
  }

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Create the tag
  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      name: normalizeTagName(name)
    })
    .select();

  if (error) {
    console.error('Error creating tag:', error);
    throw tagError(error);
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to create tag - no data returned');
  }

  return data[0] as Tag;
};

// Rename a tag. Also renames it on every note and flashcard that uses it.
export const updateTag = async (id: string, name: string) => {
  const validationError = validateTagName(name);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await supabase.rpc('rename_tag', {
    p_tag_id: id,
    p_new_name: normalizeTagName(name),
  });

  if (error) {
    console.error('Error renaming tag:', error);
    throw tagError(error);
  }

  return data as Tag;
};

// Delete a tag. Also removes it from every note and flashcard that uses it.
// Returns the number of notes the tag was removed from.
export const deleteTag = async (id: string) => {
  const { data, error } = await supabase.rpc('delete_tag', { p_tag_id: id });

  if (error) {
    console.error('Error deleting tag:', error);
    throw tagError(error);
  }

  return (data as number) ?? 0;
};

// Count the notes that use a tag (case-insensitive).
export const countNotesWithTag = async (name: string) => {
  const { data, error } = await supabase
    .from('notes')
    .select('tags');

  if (error) {
    console.error('Error counting notes with tag:', error);
    throw error;
  }

  return (data || []).filter(note => hasTag(note.tags as string[], name)).length;
};

// Turn database errors into messages that can be shown to the user.
function tagError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    return new Error('A tag with this name already exists');
  }
  return new Error(error.message || 'Something went wrong with this tag');
}


// ======================
// Daily Activity Operations
// ======================

export type TagUsage = {
  id: string;
  name: string;
  /** Number of notes with this tag, or null if counts are unavailable. */
  note_count: number | null;
};

// Tags with how many notes use each. Falls back to plain tags (no counts)
// if the get_tag_usage database function hasn't been installed yet.
export const getTagUsage = async (): Promise<TagUsage[]> => {
  const { data, error } = await supabase.rpc('get_tag_usage');

  if (!error) {
    return (data as { id: string; name: string; note_count: number | string }[]).map((row) => ({
      id: row.id,
      name: row.name,
      note_count: Number(row.note_count),
    }));
  }

  console.warn('get_tag_usage unavailable, showing tags without counts:', error.message);
  const tags = await getTags();
  return tags.map((tag) => ({ id: tag.id, name: tag.name, note_count: null }));
};

export type DailyActivity = {
  id: string;
  user_id: string;
  date: string;
  notes_count: number;
  streak_days: number;
  created_at: string;
  updated_at: string;
};

// Get current streak for a user
export const getCurrentStreak = async (): Promise<number> => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('daily_activity')
    .select('streak_days')
    .eq('date', today)
    .single();
    
  if (error && error.code !== 'PGRST116') { // PGRST116 is for "No rows found"
    console.error('Error fetching current streak:', error);
    throw error;
  }
  
  return data?.streak_days || 0;
};

// Get activity for a date range
export const getActivityForDateRange = async (startDate: string, endDate: string): Promise<DailyActivity[]> => {
  const { data, error } = await supabase
    .from('daily_activity')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
    
  if (error) {
    console.error('Error fetching activity for date range:', error);
    throw error;
  }
  
  return data as DailyActivity[];
};

// Get weekly activity
export const getWeeklyActivity = async (): Promise<DailyActivity[]> => {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];
  
  return getActivityForDateRange(startDate, endDate);
};

// Get monthly activity
export const getMonthlyActivity = async (): Promise<DailyActivity[]> => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const startDate = startOfMonth.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];
  
  return getActivityForDateRange(startDate, endDate);
};

export { createClient };