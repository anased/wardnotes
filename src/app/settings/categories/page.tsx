// src/app/settings/categories/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useCategories from '@/lib/hooks/useCategories';
import { Category } from '@/lib/supabase/client';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

export default function CategoriesPage() {
  const { user, loading: authLoading } = useAuth();
  const { categories, loading: categoriesLoading, error, addCategory, editCategory, removeCategory } = useCategories();
  const router = useRouter();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('blue');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const COLOR_OPTIONS = [
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'red', label: 'Red' },
    { value: 'yellow', label: 'Yellow' },
    { value: 'purple', label: 'Purple' },
    { value: 'pink', label: 'Pink' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'gray', label: 'Gray' },
  ];

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newCategoryName.trim()) {
      setFormError('Category name is required');
      return;
    }
    
    if (categories.some(cat => cat.name.toLowerCase() === newCategoryName.toLowerCase() && 
        (!editingCategory || cat.id !== editingCategory.id))) {
      setFormError('A category with this name already exists');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setFormError('');
      
      if (editingCategory) {
        // Update existing category
        await editCategory(editingCategory.id, {
          name: newCategoryName,
          color: newCategoryColor
        });
        setEditingCategory(null);
      } else {
        // Create new category
        await addCategory(newCategoryName, newCategoryColor);
      }
      
      // Reset form
      setNewCategoryName('');
      setNewCategoryColor('blue');
    } catch (err) {
      const error = err as Error;
      console.error('Error saving category:', error);
      setFormError(error.message || 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
  };
  
  const handleDelete = async (categoryId: string) => {
    if (confirm('Are you sure you want to delete this category? This cannot be undone.')) {
      try {
        await removeCategory(categoryId);
      } catch (err) {
        const error = err as Error;
        alert(error.message || 'Failed to delete category');
      }
    }
  };
  
  const handleCancel = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryColor('blue');
    setFormError('');
  };

  const loading = authLoading || categoriesLoading;

  if (loading) {
    return (
      <PageContainer title="Categories">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }
  const getColorHex = (colorName: string): string => {
    switch (colorName) {
      case 'blue': return '#3b82f6';
      case 'red': return '#ef4444';
      case 'green': return '#10b981';
      case 'yellow': return '#f59e0b';
      case 'purple': return '#8b5cf6';
      case 'pink': return '#ec4899';
      case 'indigo': return '#6366f1';
      case 'gray': return '#6b7280';
      default: return '#3b82f6'; // Default to blue
    }
  };
  return (
    <PageContainer title="Manage Categories">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Form for adding/editing categories */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            {editingCategory ? 'Edit Category' : 'Add New Category'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                {formError}
              </div>
            )}
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Category Name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                required
              />
              
              <div className="mb-4">
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Color
                </label>
                <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((color) => (
                    <button
                        key={color.value}
                        type="button"
                        className={`w-8 h-8 rounded-full ${
                        newCategoryColor === color.value ? 'ring-2 ring-offset-2 ring-primary-500' : ''
                        }`}
                        style={{ 
                        backgroundColor: getColorHex(color.value) 
                        }}
                        onClick={() => setNewCategoryColor(color.value)}
                        title={color.label}
                    />
                    ))}
                </div>
                </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              {editingCategory && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                isLoading={isSubmitting}
              >
                {editingCategory ? 'Update Category' : 'Add Category'}
              </Button>
            </div>
          </form>
        </div>
        
        {/* List of existing categories */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Your Categories</h2>
          
          {error && (
            <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              Error loading categories: {error.message}
            </div>
          )}
          
          {categories.length === 0 ? (
            <div className="p-4 text-center text-gray-600 dark:text-gray-400">
              You haven't created any custom categories yet.
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 rounded-lg dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                        Color
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                        Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                        Actions
                        </th>
                    </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                    {categories.map((category) => (
                        <tr key={category.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div 
                            className="w-6 h-6 rounded-full" 
                            style={{ backgroundColor: getColorHex(category.color) }}
                            />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {category.name}
                            </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                            onClick={() => handleEdit(category)}
                            className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-4"
                            >
                            Edit
                            </button>
                            <button
                            onClick={() => handleDelete(category.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                            Delete
                            </button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}