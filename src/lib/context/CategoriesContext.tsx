'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  Category
} from '../supabase/client';
import { useAuth } from './AuthContext';

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  error: Error | null;
  fetchCategories: () => Promise<void>;
  addCategory: (name: string, color?: string) => Promise<Category>;
  editCategory: (id: string, updates: { name?: string; color?: string }) => Promise<Category>;
  removeCategory: (id: string) => Promise<boolean>;
}

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  // Fetch categories function
  const fetchCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }

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
  }, [user]);

  // Load categories once when user is authenticated
  useEffect(() => {
    const currentUserId = user?.id || null;

    // Only fetch if:
    // 1. User ID changed (new user or logout), OR
    // 2. We have no categories yet (initial load)
    if (currentUserId !== lastUserIdRef.current || (currentUserId && categories.length === 0)) {
      lastUserIdRef.current = currentUserId;
      fetchCategories();
    }
  }, [user, fetchCategories, categories.length]);

  // Add a new category
  const addCategory = useCallback(async (name: string, color: string = 'blue') => {
    try {
      const newCategory = await createCategory(name, color);
      setCategories((prevCategories) => [...prevCategories, newCategory]);
      return newCategory;
    } catch (err) {
      setError(err as Error);
      console.error('Error creating category:', err);
      throw err;
    }
  }, []);

  // Update an existing category
  const editCategory = useCallback(async (id: string, updates: { name?: string; color?: string }) => {
    try {
      const updatedCategory = await updateCategory(id, updates);
      setCategories((prevCategories) =>
        prevCategories.map((cat) => (cat.id === id ? updatedCategory : cat))
      );
      return updatedCategory;
    } catch (err) {
      setError(err as Error);
      console.error(`Error updating category with ID ${id}:`, err);
      throw err;
    }
  }, []);

  // Delete a category
  const removeCategory = useCallback(async (id: string) => {
    try {
      await deleteCategory(id);
      setCategories((prevCategories) => prevCategories.filter((cat) => cat.id !== id));
      return true;
    } catch (err) {
      setError(err as Error);
      console.error(`Error deleting category with ID ${id}:`, err);
      throw err;
    }
  }, []);

  const value = {
    categories,
    loading,
    error,
    fetchCategories,
    addCategory,
    editCategory,
    removeCategory,
  };

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (context === undefined) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
}
