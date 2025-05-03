// src/app/settings/tags/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useTags from '@/lib/hooks/useTags';
import { Tag } from '@/lib/supabase/client';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

export default function TagsPage() {
  const { user, loading: authLoading } = useAuth();
  const { tags, loading: tagsLoading, error, addTag, editTag, removeTag } = useTags();
  const router = useRouter();

  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTagName.trim()) {
      setFormError('Tag name is required');
      return;
    }
    
    if (tags.some(tag => tag.name.toLowerCase() === newTagName.toLowerCase() && 
        (!editingTag || tag.id !== editingTag.id))) {
      setFormError('A tag with this name already exists');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setFormError('');
      
      if (editingTag) {
        // Update existing tag
        await editTag(editingTag.id, newTagName);
        setEditingTag(null);
      } else {
        // Create new tag
        await addTag(newTagName);
      }
      
      // Reset form
      setNewTagName('');
    } catch (err) {
      const error = err as Error;
      console.error('Error saving tag:', error);
      setFormError(error.message || 'Failed to save tag');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
  };
  
  const handleDelete = async (tagId: string) => {
    if (confirm('Are you sure you want to delete this tag? This cannot be undone.')) {
      try {
        await removeTag(tagId);
      } catch (err) {
        const error = err as Error;
        alert(error.message || 'Failed to delete tag');
      }
    }
  };
  
  const handleCancel = () => {
    setEditingTag(null);
    setNewTagName('');
    setFormError('');
  };

  const loading = authLoading || tagsLoading;

  if (loading) {
    return (
      <PageContainer title="Tags">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Manage Tags">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Form for adding/editing tags */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            {editingTag ? 'Edit Tag' : 'Add New Tag'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                {formError}
              </div>
            )}
            
            <Input
              label="Tag Name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Enter tag name"
              required
            />
            
            <div className="flex justify-end space-x-3">
              {editingTag && (
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
                {editingTag ? 'Update Tag' : 'Add Tag'}
              </Button>
            </div>
          </form>
        </div>
        
        {/* List of existing tags */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Your Tags</h2>
          
          {error && (
            <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              Error loading tags: {error.message}
            </div>
          )}
          
          {tags.length === 0 ? (
            <div className="p-4 text-center text-gray-600 dark:text-gray-400">
              You haven't created any custom tags yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tags.map((tag) => (
                <div 
                  key={tag.id} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg dark:bg-gray-700"
                >
                  <span className="text-gray-800 dark:text-gray-200">
                    {tag.name}
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(tag)}
                      className="p-1 text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}