'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import useCategories from '@/lib/hooks/useCategories';
import useTags from '@/lib/hooks/useTags'; // Add this import
import PageContainer from '@/components/layout/PageContainer';
import NoteCard from '@/components/notes/NoteCard';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';

export default function NotesPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    notes,
    loading: notesLoading,
    error,
    fetchNotes,
    search,
    filterByCategory,
    filterByTag,
    filterByCategoryAndTag
  } = useNotes();
  const { categories } = useCategories();
  const { tags } = useTags(); // Get tags from the hook
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedTag, setSelectedTag] = useState('All'); // Add state for tag filtering
  const [isSearching, setIsSearching] = useState(false);

  // Create dynamic category options including "All Categories" option
  const categoryOptions = [
    { value: 'All', label: 'All Categories' },
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name
    }))
  ];

  // Create dynamic tag options including "All Tags" option
  const tagOptions = [
    { value: 'All', label: 'All Tags' },
    ...tags.map(tag => ({
      value: tag.name,
      label: tag.name
    }))
  ];

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
  }, [user, fetchNotes]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSearching(true);
      await search(searchQuery);
      
      // Reset filters when searching
      setCategory('All');
      setSelectedTag('All');
      
      // Track search usage after search completes
      setTimeout(() => {
        track('search_used', {
          search_query: searchQuery,
          results_count: notes.length,
          subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
        });
      }, 100);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const applyFilters = async (categoryFilter: string, tagFilter: string) => {
    try {
      // If both filters are "All", fetch all notes
      if (categoryFilter === 'All' && tagFilter === 'All') {
        await fetchNotes();
        return;
      }

      // If only category is selected
      if (categoryFilter !== 'All' && tagFilter === 'All') {
        await filterByCategory(categoryFilter);
        return;
      }

      // If only tag is selected
      if (categoryFilter === 'All' && tagFilter !== 'All') {
        await filterByTag(tagFilter);
        return;
      }

      // If both filters are selected, use combined filter
      if (categoryFilter !== 'All' && tagFilter !== 'All') {
        await filterByCategoryAndTag(categoryFilter, tagFilter);
        return;
      }
    } catch (err) {
      console.error('Filter error:', err);
    }
  };

  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    await applyFilters(newCategory, selectedTag);
  };

  const handleTagChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTag = e.target.value;
    setSelectedTag(newTag);
    await applyFilters(category, newTag);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategory('All');
    setSelectedTag('All');
    fetchNotes();
  };

  const loading = authLoading || notesLoading || isSearching;

  return (
    <PageContainer title="Notes Library">
      <div className="space-y-6">
        {/* Search and filter section */}
        <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <Input
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  fullWidth
                />
              </div>
              
              <div className="w-full md:w-48">
                <Select
                  options={categoryOptions}
                  value={category}
                  onChange={handleCategoryChange}
                  fullWidth
                />
              </div>
              
              {/* Add Tag filter dropdown */}
              <div className="w-full md:w-48">
                <Select
                  options={tagOptions}
                  value={selectedTag}
                  onChange={handleTagChange}
                  fullWidth
                />
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" isLoading={isSearching}>
                  Search
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearFilters}
                  disabled={loading}
                >
                  Clear
                </Button>
              </div>
            </div>
          </form>
        </div>
        
        {/* Filter indicators */}
        {(category !== 'All' || selectedTag !== 'All') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Filtering by:
            </span>
            {category !== 'All' && (
              <div className="flex items-center px-3 py-1 text-sm bg-blue-100 rounded-full dark:bg-blue-900">
                <span className="mr-1">Category: {category}</span>
                <button
                  onClick={() => setCategory('All')}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  &times;
                </button>
              </div>
            )}
            {selectedTag !== 'All' && (
              <div className="flex items-center px-3 py-1 text-sm bg-green-100 rounded-full dark:bg-green-900">
                <span className="mr-1">Tag: {selectedTag}</span>
                <button
                  onClick={() => setSelectedTag('All')}
                  className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                >
                  &times;
                </button>
              </div>
            )}
            <button
              onClick={handleClearFilters}
              className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Clear all filters
            </button>
          </div>
        )}
        
        {/* Notes list */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner size="md" color="primary" />
            </div>
          ) : error ? (
            <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              Error loading notes: {error.message}
            </div>
          ) : notes.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-lg shadow dark:bg-gray-800">
              <p className="mb-4 text-gray-600 dark:text-gray-400">
                {searchQuery || category !== 'All' || selectedTag !== 'All'
                  ? 'No notes match your search criteria.'
                  : "You haven't created any notes yet."}
              </p>
              
              {searchQuery || category !== 'All' || selectedTag !== 'All' ? (
                <Button onClick={handleClearFilters} variant="outline">
                  Clear Filters
                </Button>
              ) : (
                <Link href="/notes/new" passHref>
                  <Button variant="primary">
                    Create Your First Note
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
        
        {/* Create new note button */}
        {notes.length > 0 && (
          <div className="flex justify-center mt-6">
            <Link href="/notes/new" passHref>
              <Button>
                Create New Note
              </Button>
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}