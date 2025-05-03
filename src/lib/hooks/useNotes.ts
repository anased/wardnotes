import { useState, useEffect, useCallback } from 'react';
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

  // Use useCallback to memoize the fetchNotes function
  const fetchNotes = useCallback(async () => {
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
  }, []); // Empty dependency array means this function reference will be stable

  // Load all notes on component mount
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]); // Now safe to include in dependencies

  // Fetch a single note by ID
  const fetchNoteById = useCallback(async (id: string) => {
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
  }, []);

  // Create a new note
  const addNote = useCallback(async (note: Omit<Note, 'id' | 'user_id' | 'created_at'>) => {
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
  }, []);

  // Update an existing note
  const editNote = useCallback(async (id: string, note: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
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
  }, []);

  // Delete a note
  const removeNote = useCallback(async (id: string) => {
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
  }, []);

  // Search notes by text
  const search = useCallback(async (query: string) => {
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
  }, [fetchNotes]);

  // Filter notes by category
  const filterByCategory = useCallback(async (category: string) => {
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
  }, [fetchNotes]);

  // Filter notes by tag
  const filterByTag = useCallback(async (tag: string) => {
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
  }, [fetchNotes]);

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