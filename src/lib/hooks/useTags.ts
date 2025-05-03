// src/lib/hooks/useTags.ts
import { useState, useEffect, useCallback } from 'react';
import { 
  getTags,
  createTag,
  updateTag,
  deleteTag,
  Tag
} from '../supabase/client';

export default function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use useCallback to memoize the fetchTags function
  const fetchTags = useCallback(async () => {
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
  }, []);

  // Load all tags on component mount
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Add a new tag
  const addTag = useCallback(async (name: string) => {
    try {
      setLoading(true);
      const newTag = await createTag(name);
      setTags((prevTags) => [...prevTags, newTag]);
      return newTag;
    } catch (err) {
      setError(err as Error);
      console.error('Error creating tag:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update an existing tag
  const editTag = useCallback(async (id: string, name: string) => {
    try {
      setLoading(true);
      const updatedTag = await updateTag(id, name);
      setTags((prevTags) =>
        prevTags.map((tag) => (tag.id === id ? updatedTag : tag))
      );
      return updatedTag;
    } catch (err) {
      setError(err as Error);
      console.error(`Error updating tag with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a tag
  const removeTag = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await deleteTag(id);
      setTags((prevTags) => prevTags.filter((tag) => tag.id !== id));
      return true;
    } catch (err) {
      setError(err as Error);
      console.error(`Error deleting tag with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tags,
    loading,
    error,
    fetchTags,
    addTag,
    editTag,
    removeTag,
  };
}