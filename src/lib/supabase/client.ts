// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { hasTag, normalizeTagName, validateTagName } from '../utils/tagUtils';

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
  category: string; // Changed from enum to string type
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

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
    .select('*')
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
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching note by ID:', error);
    throw error;
  }

  return data as Note;
};

// Create a new note
export const createNote = async (note: Omit<Note, 'id' | 'user_id' | 'created_at'>) => {
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
    .select();

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
export const updateNote = async (id: string, note: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('notes')
    .update(note)
    .eq('id', id)
    .select()
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
    .rpc('search_notes', { search_query: query });

  if (error) {
    console.error('Error searching notes:', error);
    throw error;
  }

  return data as Note[];
};

export type NoteFilters = {
  /** Category name; omit (or 'All') for every category. */
  category?: string;
  /** Notes must have ALL of these tags. */
  tags?: string[];
};

// Filter notes by category and/or tags. Tag matching is AND: a note must
// carry every selected tag. Tag names are canonical in the database, so
// an exact array containment check is enough.
export const filterNotes = async ({ category, tags = [] }: NoteFilters) => {
  let query = supabase.from('notes').select('*');

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  if (tags.length > 0) {
    query = query.contains('tags', tags);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error filtering notes:', error);
    throw error;
  }

  return data as Note[];
};

// Fetch notes that could be related to `note`: any that share a tag, plus
// the most recent ones in the same category. Ranking happens client-side
// (see rankRelatedNotes); this only narrows the candidate pool.
export const getRelatedNoteCandidates = async (
  note: Pick<Note, 'id' | 'tags' | 'category'>,
  { tagLimit = 50, categoryLimit = 20 }: { tagLimit?: number; categoryLimit?: number } = {}
) => {
  const tags = (note.tags || []).filter(Boolean);

  const byTags = tags.length
    ? supabase
        .from('notes')
        .select('*')
        .overlaps('tags', tags)
        .neq('id', note.id)
        .order('created_at', { ascending: false })
        .limit(tagLimit)
    : null;

  const byCategory = note.category
    ? supabase
        .from('notes')
        .select('*')
        .eq('category', note.category)
        .neq('id', note.id)
        .order('created_at', { ascending: false })
        .limit(categoryLimit)
    : null;

  const [tagResult, categoryResult] = await Promise.all([byTags, byCategory]);

  const error = tagResult?.error || categoryResult?.error;
  if (error) {
    console.error('Error fetching related notes:', error);
    throw error;
  }

  return [
    ...((tagResult?.data as Note[] | null) ?? []),
    ...((categoryResult?.data as Note[] | null) ?? []),
  ];
};

// ======================
// Category Operations
// ======================

// Get all categories for the current user
export const getCategories = async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }

  return data as Category[];
};

// Create a new category
export const createCategory = async (name: string, color: string = 'blue') => {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  // Create the category
  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name: normalizeTagName(name),
      color
    })
    .select();

  if (error) {
    console.error('Error creating category:', error);
    throw categoryError(error);
  }
  
  if (!data || data.length === 0) {
    throw new Error('Failed to create category - no data returned');
  }

  return data[0] as Category;
};

// Category names are unique per user ignoring case (enforced in the database).
const categoryError = (error: { code?: string; message: string }) =>
  error.code === '23505'
    ? new Error('A category with this name already exists')
    : error;

// Update a category
export const updateCategory = async (id: string, updates: { name?: string; color?: string }) => {
  const normalized =
    updates.name === undefined ? updates : { ...updates, name: normalizeTagName(updates.name) };

  const { data, error } = await supabase
    .from('categories')
    .update(normalized)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating category:', error);
    throw categoryError(error);
  }

  return data as Category;
};

// Delete a category
export const deleteCategory = async (id: string) => {
  // First check if this category is used by any notes
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id')
    .eq('category', id)
    .limit(1);

  if (notesError) {
    console.error('Error checking if category is in use:', notesError);
    throw notesError;
  }

  // If category is in use, don't delete it
  if (notes && notes.length > 0) {
    throw new Error('Cannot delete category that is in use by notes');
  }

  // Delete the category
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }

  return true;
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