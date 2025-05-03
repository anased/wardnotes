'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import PageContainer from '@/components/layout/PageContainer';
import NoteCard from '@/components/notes/NoteCard';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';

const CATEGORY_OPTIONS = [
  { value: 'All', label: 'All Categories' },
  { value: 'Neurology', label: 'Neurology' },
  { value: 'Cardiology', label: 'Cardiology' },
  { value: 'General', label: 'General' },
  { value: 'Procedures', label: 'Procedures' },
];

export default function NotesPage() {
  const { user, loading: authLoading } = useAuth();
  const { 
    notes, 
    loading: notesLoading, 
    error, 
    fetchNotes,
    search,
    filterByCategory 
  } = useNotes();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [isSearching, setIsSearching] = useState(false);

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
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    
    try {
      await filterByCategory(newCategory);
    } catch (err) {
      console.error('Category filter error:', err);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategory('All');
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
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={handleCategoryChange}
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
                {searchQuery || category !== 'All'
                  ? 'No notes match your search criteria.'
                  : "You haven't created any notes yet."}
              </p>
              
              {searchQuery || category !== 'All' ? (
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