'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  Tag
} from '../supabase/client';
import { useAuth } from './AuthContext';

interface TagsContextType {
  tags: Tag[];
  loading: boolean;
  error: Error | null;
  fetchTags: () => Promise<void>;
  addTag: (name: string) => Promise<Tag>;
  editTag: (id: string, name: string) => Promise<Tag>;
  removeTag: (id: string) => Promise<boolean>;
}

const TagsContext = createContext<TagsContextType | undefined>(undefined);

export function TagsProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  // Fetch tags function
  const fetchTags = useCallback(async () => {
    if (!user) {
      setTags([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getTags();
      setTags(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching tags:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load tags once when user is authenticated
  useEffect(() => {
    const currentUserId = user?.id || null;

    // Only fetch if:
    // 1. User ID changed (new user or logout), OR
    // 2. We have no tags yet (initial load)
    if (currentUserId !== lastUserIdRef.current || (currentUserId && tags.length === 0)) {
      lastUserIdRef.current = currentUserId;
      fetchTags();
    }
  }, [user, fetchTags, tags.length]);

  // Add a new tag
  const addTag = useCallback(async (name: string) => {
    try {
      const newTag = await createTag(name);
      setTags((prevTags) => [...prevTags, newTag]);
      return newTag;
    } catch (err) {
      setError(err as Error);
      console.error('Error creating tag:', err);
      throw err;
    }
  }, []);

  // Update an existing tag
  const editTag = useCallback(async (id: string, name: string) => {
    try {
      const updatedTag = await updateTag(id, name);
      setTags((prevTags) =>
        prevTags.map((tag) => (tag.id === id ? updatedTag : tag))
      );
      return updatedTag;
    } catch (err) {
      setError(err as Error);
      console.error(`Error updating tag with ID ${id}:`, err);
      throw err;
    }
  }, []);

  // Delete a tag
  const removeTag = useCallback(async (id: string) => {
    try {
      await deleteTag(id);
      setTags((prevTags) => prevTags.filter((tag) => tag.id !== id));
      return true;
    } catch (err) {
      setError(err as Error);
      console.error(`Error deleting tag with ID ${id}:`, err);
      throw err;
    }
  }, []);

  const value = {
    tags,
    loading,
    error,
    fetchTags,
    addTag,
    editTag,
    removeTag,
  };

  return (
    <TagsContext.Provider value={value}>
      {children}
    </TagsContext.Provider>
  );
}

export function useTags() {
  const context = useContext(TagsContext);
  if (context === undefined) {
    throw new Error('useTags must be used within a TagsProvider');
  }
  return context;
}
