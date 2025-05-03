import { createClient } from '@supabase/supabase-js';

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
  content: any; // TipTap JSON content
  tags: string[];
  category: 'Neurology' | 'Cardiology' | 'General' | 'Procedures';
  created_at: string;
};

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
    .from('notes')
    .select('*')
    .or(`title.ilike.%${query}%, content.ilike.%${query}%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error searching notes:', error);
    throw error;
  }

  return data as Note[];
};

// Filter notes by category
export const filterNotesByCategory = async (category: string) => {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('category', category)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error filtering notes by category:', error);
    throw error;
  }

  return data as Note[];
};

// Filter notes by tag
export const filterNotesByTag = async (tag: string) => {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .contains('tags', [tag])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error filtering notes by tag:', error);
    throw error;
  }

  return data as Note[];
};

export { createClient };