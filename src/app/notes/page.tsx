'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import useCategories from '@/lib/hooks/useCategories';
import useTags from '@/lib/hooks/useTags';
import PageContainer from '@/components/layout/PageContainer';
import NoteCard from '@/components/notes/NoteCard';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import TagFilterCombobox, { TagFilterOption } from '@/components/ui/TagFilterCombobox';
import { getTagUsage, TagUsage } from '@/lib/supabase/client';
import { canonicalTagName, hasTag, tagsEqual } from '@/lib/utils/tagUtils';
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
    filterNotes
  } = useNotes();
  const { categories } = useCategories();
  const { tags } = useTags(); // Get tags from the hook
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [tagUsage, setTagUsage] = useState<TagUsage[]>([]);

  // Create dynamic category options including "All Categories" option
  const categoryOptions = [
    { value: 'All', label: 'All Categories' },
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name
    }))
  ];

  // Tag usage counts; refetched when the tag list changes (add/rename/delete)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getTagUsage()
      .then((usage) => {
        if (!cancelled) setTagUsage(usage);
      })
      .catch((err) => console.error('Error loading tag usage:', err));
    return () => {
      cancelled = true;
    };
  }, [user, tags]);

  const tagOptions: TagFilterOption[] = useMemo(() => {
    if (tagUsage.length > 0) {
      return tagUsage.map((t) => ({ name: t.name, count: t.note_count }));
    }
    return tags.map((t) => ({ name: t.name, count: null }));
  }, [tagUsage, tags]);

  // Keep the active filters in the URL (?category=...&tag=a&tag=b) so views
  // can be shared and survive a refresh.
  const syncUrl = useCallback((categoryFilter: string, tagFilters: string[]) => {
    const params = new URLSearchParams();
    if (categoryFilter !== 'All') params.set('category', categoryFilter);
    tagFilters.forEach((t) => params.append('tag', t));
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  const applyFilters = useCallback(async (categoryFilter: string, tagFilters: string[]) => {
    syncUrl(categoryFilter, tagFilters);
    try {
      await filterNotes({ category: categoryFilter, tags: tagFilters });
    } catch (err) {
      console.error('Filter error:', err);
    }
  }, [filterNotes, syncUrl]);

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  // Initial filters come from the URL, e.g. a tag or category clicked on the
  // dashboard or a note page: /notes?tag=...&category=...
  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const tagsFromUrl = params.getAll('tag').filter(Boolean);
    const categoryFromUrl = params.get('category') || 'All';

    setCategory(categoryFromUrl);
    setSelectedTags(tagsFromUrl);

    if (tagsFromUrl.length > 0 || categoryFromUrl !== 'All') {
      applyFilters(categoryFromUrl, tagsFromUrl);
    } else {
      fetchNotes();
    }
    // Only on login / first load; later changes go through the handlers
  }, [user]);

  // Tags in the URL may use another spelling ("stroke"); once the tag list
  // has loaded, switch to the stored spelling so the filter matches.
  useEffect(() => {
    if (tags.length === 0 || selectedTags.length === 0) return;
    const known = tags.map((t) => t.name);
    const canonical = selectedTags.map((t) => canonicalTagName(t, known));
    if (canonical.some((t, i) => t !== selectedTags[i])) {
      setSelectedTags(canonical);
      applyFilters(category, canonical);
    }
  }, [tags]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSearching(true);
      await search(searchQuery);
      
      // Reset filters when searching
      setCategory('All');
      setSelectedTags([]);
      syncUrl('All', []);
      
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

  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    await applyFilters(newCategory, selectedTags);
  };

  const handleTagsChange = async (newTags: string[]) => {
    setSearchQuery('');
    setSelectedTags(newTags);
    await applyFilters(category, newTags);
  };

  // Clicking a tag on a note card adds it to the tag filter
  const handleNoteTagClick = async (tag: string) => {
    if (hasTag(selectedTags, tag)) return;
    await handleTagsChange([...selectedTags, tag]);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategory('All');
    setSelectedTags([]);
    syncUrl('All', []);
    fetchNotes();
  };

  const hasActiveFilters = category !== 'All' || selectedTags.length > 0;

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
              
              <div className="w-full md:w-72">
                <TagFilterCombobox
                  options={tagOptions}
                  value={selectedTags}
                  onChange={handleTagsChange}
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
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Filtering by:
            </span>
            {category !== 'All' && (
              <div className="flex items-center px-3 py-1 text-sm bg-blue-100 rounded-full dark:bg-blue-900">
                <span className="mr-1">Category: {category}</span>
                <button
                  onClick={() => {
                    setCategory('All');
                    applyFilters('All', selectedTags);
                  }}
                  aria-label={`Remove category filter ${category}`}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  &times;
                </button>
              </div>
            )}
            {selectedTags.map((tag) => (
              <div key={tag} className="flex items-center px-3 py-1 text-sm bg-green-100 rounded-full dark:bg-green-900">
                <span className="mr-1">Tag: {tag}</span>
                <button
                  onClick={() => handleTagsChange(selectedTags.filter((t) => !tagsEqual(t, tag)))}
                  aria-label={`Remove tag filter ${tag}`}
                  className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                >
                  &times;
                </button>
              </div>
            ))}
            {selectedTags.length > 1 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">(notes with all of these tags)</span>
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
                {searchQuery || hasActiveFilters
                  ? 'No notes match your search criteria.'
                  : "You haven't created any notes yet."}
              </p>
              
              {searchQuery || hasActiveFilters ? (
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
                <NoteCard key={note.id} note={note} onTagClick={handleNoteTagClick} />
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