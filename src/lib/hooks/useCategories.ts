// src/lib/hooks/useCategories.ts
import { useState, useEffect, useCallback } from 'react';
import { 
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  Category
} from '../supabase/client';

export default function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use useCallback to memoize the fetchCategories function
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all categories on component mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Add a new category
  const addCategory = useCallback(async (name: string, color: string = 'blue') => {
    try {
      setLoading(true);
      const newCategory = await createCategory(name, color);
      setCategories((prevCategories) => [...prevCategories, newCategory]);
      return newCategory;
    } catch (err) {
      setError(err as Error);
      console.error('Error creating category:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update an existing category
  const editCategory = useCallback(async (id: string, updates: { name?: string; color?: string }) => {
    try {
      setLoading(true);
      const updatedCategory = await updateCategory(id, updates);
      setCategories((prevCategories) =>
        prevCategories.map((cat) => (cat.id === id ? updatedCategory : cat))
      );
      return updatedCategory;
    } catch (err) {
      setError(err as Error);
      console.error(`Error updating category with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a category
  const removeCategory = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await deleteCategory(id);
      setCategories((prevCategories) => prevCategories.filter((cat) => cat.id !== id));
      return true;
    } catch (err) {
      setError(err as Error);
      console.error(`Error deleting category with ID ${id}:`, err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    categories,
    loading,
    error,
    fetchCategories,
    addCategory,
    editCategory,
    removeCategory,
  };
}