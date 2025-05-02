import { useState, useEffect } from 'react';
import { 
  getNotes, 
  getNoteById, 
  createNote, 
  updateNote, 
  deleteNote, 
  searchNotes, 
  filterNotesByCategory, 
  filterNotesByTag,
  Note
} from '../supabase/client';

export default function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load all notes on component mount
  useEffect(() => {
    fetchNotes();
  }, []);

  // Fetch all notes
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const data = await getNotes();
      setNotes(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch a single note by ID
  const fetchNoteById = async (id: string) => {
    try {
      setLoading(true);
      const data = await getNoteById(id);
      return data;
    } catch (err) {
      setError(err as Error);
      console.error(`Error fetching note with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Create a new note
  const addNote = async (note: Omit<Note, 'id' | 'user_id' | 'created_at'>) => {
    try {
      setLoading(true);
      const newNote = await createNote(note);
      setNotes((prevNotes) => [newNote, ...prevNotes]);
      return newNote;
    } catch (err) {
      setError(err as Error);
      console.error('Error creating note:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update an existing note
  const editNote = async (id: string, note: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
    try {
      setLoading(true);
      const updatedNote = await updateNote(id, note);
      setNotes((prevNotes) =>
        prevNotes.map((n) => (n.id === id ? updatedNote : n))
      );
      return updatedNote;
    } catch (err) {
      setError(err as Error);
      console.error(`Error updating note with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete a note
  const removeNote = async (id: string) => {
    try {
      setLoading(true);
      await deleteNote(id);
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== id));
    } catch (err) {
      setError(err as Error);
      console.error(`Error deleting note with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Search notes by text
  const search = async (query: string) => {
    try {
      setLoading(true);
      if (!query.trim()) {
        return fetchNotes();
      }
      const results = await searchNotes(query);
      setNotes(results);
    } catch (err) {
      setError(err as Error);
      console.error(`Error searching notes with query "${query}":`, err);
    } finally {
      setLoading(false);
    }
  };

  // Filter notes by category
  const filterByCategory = async (category: string) => {
    try {
      setLoading(true);
      if (!category || category === 'All') {
        return fetchNotes();
      }
      const results = await filterNotesByCategory(category);
      setNotes(results);
    } catch (err) {
      setError(err as Error);
      console.error(`Error filtering notes by category "${category}":`, err);
    } finally {
      setLoading(false);
    }
  };

  // Filter notes by tag
  const filterByTag = async (tag: string) => {
    try {
      setLoading(true);
      if (!tag.trim()) {
        return fetchNotes();
      }
      const results = await filterNotesByTag(tag);
      setNotes(results);
    } catch (err) {
      setError(err as Error);
      console.error(`Error filtering notes by tag "${tag}":`, err);
    } finally {
      setLoading(false);
    }
  };

  return {
    notes,
    loading,
    error,
    fetchNotes,
    fetchNoteById,
    addNote,
    editNote,
    removeNote,
    search,
    filterByCategory,
    filterByTag,
  };
}