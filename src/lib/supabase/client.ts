// src/lib/supabase/client.ts
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
      name,
      color
    })
    .select();

  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    throw new Error('Failed to create category - no data returned');
  }

  return data[0] as Category;
};

// Update a category
export const updateCategory = async (id: string, updates: { name?: string; color?: string }) => {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating category:', error);
    throw error;
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
      name
    })
    .select();

  if (error) {
    console.error('Error creating tag:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    throw new Error('Failed to create tag - no data returned');
  }

  return data[0] as Tag;
};

// Update a tag
export const updateTag = async (id: string, name: string) => {
  const { data, error } = await supabase
    .from('tags')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating tag:', error);
    throw error;
  }

  return data as Tag;
};

// Delete a tag
export const deleteTag = async (id: string) => {
  // First check if this tag is used by any notes
  const { data: tagData, error: tagError } = await supabase
    .from('tags')
    .select('name')
    .eq('id', id)
    .single();

  if (tagError) {
    console.error('Error fetching tag name:', tagError);
    throw tagError;
  }

  const tagName = tagData?.name;

  // Check if this tag is used in any notes
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id')
    .contains('tags', [tagName])
    .limit(1);

  if (notesError) {
    console.error('Error checking if tag is in use:', notesError);
    throw notesError;
  }

  // If tag is in use, don't delete it
  if (notes && notes.length > 0) {
    throw new Error('Cannot delete tag that is in use by notes');
  }

  // Delete the tag
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }

  return true;
};

export { createClient };