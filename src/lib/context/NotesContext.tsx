'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import { useAuth } from './AuthContext';

interface NotesContextType {
  notes: Note[];
  loading: boolean;
  error: Error | null;
  fetchNotes: () => Promise<void>;
  fetchNoteById: (id: string) => Promise<Note>;
  addNote: (note: Omit<Note, 'id' | 'user_id' | 'created_at'>) => Promise<Note>;
  editNote: (id: string, note: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => Promise<Note>;
  removeNote: (id: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  filterByCategory: (category: string) => Promise<void>;
  filterByTag: (tag: string) => Promise<void>;
  filterByCategoryAndTag: (category: string, tag: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  // Fetch all notes
  const fetchNotes = useCallback(async () => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getNotes();
      setNotes(data);
      setError(null);
      setIsFiltered(false);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load notes once when user is authenticated
  useEffect(() => {
    const currentUserId = user?.id || null;

    // Only fetch if:
    // 1. User ID changed (new user or logout), OR
    // 2. We have no notes yet (initial load) AND not in a filtered state
    if (currentUserId !== lastUserIdRef.current || (currentUserId && notes.length === 0 && !isFiltered)) {
      lastUserIdRef.current = currentUserId;
      fetchNotes();
    }
  }, [user, fetchNotes, notes.length, isFiltered]);

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

  // Search notes by text (calls backend, maintains existing behavior)
  const search = useCallback(async (query: string) => {
    try {
      setLoading(true);
      if (!query.trim()) {
        return fetchNotes();
      }
      const results = await searchNotes(query);
      setNotes(results);
      setError(null);
      setIsFiltered(true);
    } catch (err) {
      setError(err as Error);
      console.error(`Error searching notes with query "${query}":`, err);
    } finally {
      setLoading(false);
    }
  }, [fetchNotes]);

  // Filter notes by category (calls backend, maintains existing behavior)
  const filterByCategory = useCallback(async (category: string) => {
    try {
      setLoading(true);
      if (!category || category === 'All') {
        return fetchNotes();
      }
      const results = await filterNotesByCategory(category);
      setNotes(results);
      setError(null);
      setIsFiltered(true);
    } catch (err) {
      setError(err as Error);
      console.error(`Error filtering notes by category "${category}":`, err);
    } finally {
      setLoading(false);
    }
  }, [fetchNotes]);

  // Filter notes by tag (calls backend, maintains existing behavior)
  const filterByTag = useCallback(async (tag: string) => {
    try {
      setLoading(true);
      if (!tag.trim() || tag === 'All') {
        return fetchNotes();
      }
      const results = await filterNotesByTag(tag);
      setNotes(results);
      setError(null);
      setIsFiltered(true);
    } catch (err) {
      setError(err as Error);
      console.error(`Error filtering notes by tag "${tag}":`, err);
    } finally {
      setLoading(false);
    }
  }, [fetchNotes]);

  // Filter notes by both category and tag
  const filterByCategoryAndTag = useCallback(async (category: string, tag: string) => {
    try {
      setLoading(true);

      // Fetch all notes first
      const allNotes = await getNotes();

      // Apply filters client-side
      let results = allNotes;

      // Filter by category if specified
      if (category && category !== 'All') {
        results = results.filter(note => note.category === category);
      }

      // Filter by tag if specified
      if (tag && tag !== 'All') {
        results = results.filter(note => note.tags && note.tags.includes(tag));
      }

      setNotes(results);
      setError(null);
      setIsFiltered(true);
    } catch (err) {
      setError(err as Error);
      console.error(`Error filtering notes by category "${category}" and tag "${tag}":`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
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
    filterByCategoryAndTag,
  };

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
}
