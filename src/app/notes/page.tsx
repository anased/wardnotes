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
import TopicSidebar from '@/components/topics/TopicSidebar';
import useTopics from '@/lib/hooks/useTopics';
import { getTagUsage, TagUsage } from '@/lib/supabase/client';
import { canonicalTagName, hasTag, tagsEqual } from '@/lib/utils/tagUtils';
import {
  CONTENT_TYPE_LABELS,
  STATUS_LABELS,
  contentTypeOptions,
  isContentType,
  isNoteStatus,
} from '@/lib/utils/noteFields';
import {
  EMPTY_FILTERS,
  LibraryFilters,
  buildLibraryQuery,
  hasFieldFilters,
  parseLibraryParams,
} from '@/lib/utils/libraryFilters';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'answered', label: STATUS_LABELS.answered },
  { value: 'unanswered', label: STATUS_LABELS.unanswered },
];

const TYPE_OPTIONS = contentTypeOptions('Any type');

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
  const { tags } = useTags();
  const { graph: topicGraph } = useTopics();
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const router = useRouter();

  // Applied filters (mirrored in the URL) and the text currently in the search box
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [tagUsage, setTagUsage] = useState<TagUsage[]>([]);

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

  /**
   * Applies filters: updates state and the URL (so views can be shared and
   * survive a refresh), then loads the matching notes.
   */
  const applyFilters = useCallback(async (next: LibraryFilters) => {
    setFilters(next);
    const qs = buildLibraryQuery(next);
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);

    try {
      if (next.q) {
        await search(next.q);
      } else if (hasFieldFilters(next)) {
        await filterNotes({
          category: next.category,
          tags: next.tags,
          status: next.status || undefined,
          contentType: next.contentType || undefined,
          topicId: next.topic || undefined,
        });
      } else {
        await fetchNotes();
      }
    } catch (err) {
      console.error('Filter error:', err);
    }
  }, [search, filterNotes, fetchNotes]);

  const updateFilters = (changes: Partial<LibraryFilters>) => {
    // Changing a filter ends a text search
    setSearchInput('');
    return applyFilters({ ...filters, q: '', ...changes });
  };

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
    const fromUrl = parseLibraryParams(window.location.search);
    setSearchInput(fromUrl.q);
    applyFilters(fromUrl);
    // Only on login / first load; later changes go through the handlers
  }, [user]);

  // Tags in the URL may use another spelling ("stroke"); once the tag list
  // has loaded, switch to the stored spelling so the filter matches.
  useEffect(() => {
    if (tags.length === 0 || filters.tags.length === 0) return;
    const known = tags.map((t) => t.name);
    const canonical = filters.tags.map((t) => canonicalTagName(t, known));
    if (canonical.some((t, i) => t !== filters.tags[i])) {
      applyFilters({ ...filters, tags: canonical });
    }
  }, [tags]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();

    try {
      setIsSearching(true);
      // A search replaces the other filters
      await applyFilters({ ...EMPTY_FILTERS, q });

      if (q) {
        // Track search usage after search completes
        setTimeout(() => {
          track('search_used', {
            search_query: q,
            results_count: notes.length,
            subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
          });
        }, 100);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Clicking a tag on a note card adds it to the tag filter
  const handleNoteTagClick = async (tag: string) => {
    if (hasTag(filters.tags, tag)) return;
    await updateFilters({ tags: [...filters.tags, tag] });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    applyFilters(EMPTY_FILTERS);
  };

  const hasActiveFilters = hasFieldFilters(filters);
  const selectedTopic = filters.topic ? topicGraph.byId.get(filters.topic) : undefined;
  const topicHasSubtopics = !!filters.topic && (topicGraph.children.get(filters.topic)?.length ?? 0) > 0;
  const loading = authLoading || notesLoading || isSearching;

  const chipButtonClass =
    'ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

  return (
    <PageContainer title="Notes Library">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Topic tree: a sidebar on large screens, a collapsible panel on small ones.
            Topics open their page (which links back here, filtered). */}
        <TopicSidebar selectedId={filters.topic || null} />

        <div className="space-y-6 min-w-0">
          {/* Search and filter section */}
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <form onSubmit={handleSearch} role="search" className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Input
                  aria-label="Search notes"
                  placeholder="Search notes..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
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
            </form>

            <div className="grid grid-cols-1 mt-3 gap-x-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,11rem))_1fr]">
              <Select
                aria-label="Category"
                options={categoryOptions}
                value={filters.category}
                onChange={(e) => updateFilters({ category: e.target.value })}
              />
              <Select
                aria-label="Type"
                options={TYPE_OPTIONS}
                value={filters.contentType}
                onChange={(e) =>
                  updateFilters({ contentType: isContentType(e.target.value) ? e.target.value : '' })
                }
              />
              <Select
                aria-label="Status"
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(e) =>
                  updateFilters({ status: isNoteStatus(e.target.value) ? e.target.value : '' })
                }
              />
              <div className="mb-4 sm:col-span-3 lg:col-span-1">
                <TagFilterCombobox
                  options={tagOptions}
                  value={filters.tags}
                  onChange={(next) => updateFilters({ tags: next })}
                />
              </div>
            </div>
          </div>

          {/* Filter indicators */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Filtering by:
              </span>
              {filters.topic && (
                <div className="flex items-center px-3 py-1 text-sm rounded-full bg-primary-100 dark:bg-primary-900/60">
                  <span>
                    Topic:{' '}
                    <Link
                      href={`/topics/${filters.topic}`}
                      className="underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      {selectedTopic?.name ?? 'Unknown topic'}
                    </Link>
                    {topicHasSubtopics && (
                      <span className="text-primary-700 dark:text-primary-300"> + subtopics</span>
                    )}
                  </span>
                  <button
                    onClick={() => updateFilters({ topic: '' })}
                    aria-label="Remove topic filter"
                    className={`${chipButtonClass} text-primary-600 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-100`}
                  >
                    &times;
                  </button>
                </div>
              )}
              {filters.category !== 'All' && (
                <div className="flex items-center px-3 py-1 text-sm bg-blue-100 rounded-full dark:bg-blue-900">
                  <span>Category: {filters.category}</span>
                  <button
                    onClick={() => updateFilters({ category: 'All' })}
                    aria-label={`Remove category filter ${filters.category}`}
                    className={`${chipButtonClass} text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100`}
                  >
                    &times;
                  </button>
                </div>
              )}
              {filters.contentType && (
                <div className="flex items-center px-3 py-1 text-sm bg-gray-100 rounded-full dark:bg-gray-700">
                  <span>Type: {CONTENT_TYPE_LABELS[filters.contentType]}</span>
                  <button
                    onClick={() => updateFilters({ contentType: '' })}
                    aria-label="Remove type filter"
                    className={`${chipButtonClass} text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white`}
                  >
                    &times;
                  </button>
                </div>
              )}
              {filters.status && (
                <div className="flex items-center px-3 py-1 text-sm rounded-full bg-amber-100 dark:bg-amber-900/60">
                  <span>Status: {STATUS_LABELS[filters.status]}</span>
                  <button
                    onClick={() => updateFilters({ status: '' })}
                    aria-label="Remove status filter"
                    className={`${chipButtonClass} text-amber-700 hover:text-amber-900 dark:text-amber-200 dark:hover:text-white`}
                  >
                    &times;
                  </button>
                </div>
              )}
              {filters.tags.map((tag) => (
                <div key={tag} className="flex items-center px-3 py-1 text-sm bg-green-100 rounded-full dark:bg-green-900">
                  <span>Tag: {tag}</span>
                  <button
                    onClick={() => updateFilters({ tags: filters.tags.filter((t) => !tagsEqual(t, tag)) })}
                    aria-label={`Remove tag filter ${tag}`}
                    className={`${chipButtonClass} text-green-600 hover:text-green-800 dark:text-green-300 dark:hover:text-green-100`}
                  >
                    &times;
                  </button>
                </div>
              ))}
              {filters.tags.length > 1 && (
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
                  {filters.q || hasActiveFilters
                    ? 'No notes match your search criteria.'
                    : "You haven't created any notes yet."}
                </p>

                {filters.q || hasActiveFilters ? (
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
              <div className="note-grid">
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
      </div>
    </PageContainer>
  );
}
