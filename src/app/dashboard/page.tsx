'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useDashboardStats } from '@/lib/hooks/useDashboardStats';
import PageContainer from '@/components/layout/PageContainer';
import NoteCard from '@/components/notes/NoteCard';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import QuotaDisplay from '@/components/premium/QuotaDisplay';
import { useNotification } from '@/lib/context/NotificationContext';
import {
  buildWeek,
  countThisWeek,
  reviewMinutes,
} from '@/lib/utils/dashboard';

const RECENT_NOTES = 6;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { notes, loading: notesLoading, error } = useNotes();
  const { isPremium } = useSubscription();
  const stats = useDashboardStats(!!user);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification } = useNotification();

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }

    // Check for auth success message
    const authSuccess = searchParams?.get('auth_success');
    if (authSuccess === 'true') {
      // Check if it's a Google login (user has Google metadata)
      const isGoogleLogin = user?.app_metadata?.provider === 'google';
      const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'User';

      if (isGoogleLogin) {
        showNotification(`Welcome, ${userName}! You've successfully signed in with Google.`, 'success');
      } else {
        showNotification('You have successfully signed in!', 'success');
      }

      // Remove the query parameter to prevent showing the notification on refresh
      router.replace('/dashboard');
    }
  }, [user, authLoading, router, searchParams, showNotification]);

  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => buildWeek(now, stats.activeDates), [now, stats.activeDates]);
  const notesThisWeek = useMemo(() => countThisWeek(notes, now), [notes, now]);
  const incompleteCount = useMemo(() => notes.filter((n) => n.status === 'unanswered').length, [notes]);

  if (authLoading || notesLoading) {
    return (
      <PageContainer title="Home">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  const due = stats.dueCount ?? 0;
  const activeDays = week.filter((d) => d.active).length;
  const daysSoFar = week.filter((d) => !d.isFuture).length;

  return (
    <PageContainer title="Home">
      <div className="flex flex-col gap-7">
        <section aria-label="Today" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {/* Flashcards due */}
          <div className={statCard}>
            <h2 className={statLabel}>Flashcards due</h2>
            <div className="flex items-baseline gap-2">
              <span className={statValue}>{stats.loading ? '–' : stats.dueCount ?? '–'}</span>
              {due > 0 && <span className={statUnit}>≈ {reviewMinutes(due)} min</span>}
            </div>
            <Link
              href="/flashcards"
              className="mt-auto inline-flex items-center justify-center h-11 rounded-lg bg-primary-600 text-white text-[15px] font-semibold
                hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
                dark:focus-visible:ring-offset-gray-800"
            >
              {due > 0 ? 'Start review' : 'Open flashcards'}
            </Link>
          </div>

          {/* Streak */}
          <div className={statCard}>
            <h2 className={statLabel}>Streak</h2>
            <div className="flex items-baseline gap-2">
              <span className={statValue}>{stats.loading ? '–' : stats.currentStreak}</span>
              <span className={statUnit}>{stats.currentStreak === 1 ? 'day' : 'days'}</span>
            </div>
            <Link
              href="/learning-tracker"
              className="mt-auto flex gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              aria-label={`Active on ${activeDays} of ${daysSoFar} ${daysSoFar === 1 ? 'day' : 'days'} this week. Open the learning tracker.`}
            >
              {week.map((d) => (
                <span key={d.date} aria-hidden="true" className="flex flex-col items-center gap-1 flex-1">
                  <span
                    className={`w-full h-[22px] rounded-md ${
                      d.active
                        ? 'bg-primary-600 dark:bg-primary-500'
                        : d.isFuture
                          ? 'border border-dashed border-gray-300 dark:border-gray-600'
                          : 'bg-gray-200 dark:bg-gray-700'
                    } ${d.isToday ? 'ring-2 ring-offset-1 ring-primary-300 dark:ring-primary-700 dark:ring-offset-gray-800' : ''}`}
                  />
                  <span className={`text-[11px] ${d.isToday ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                    {d.label}
                  </span>
                </span>
              ))}
            </Link>
          </div>

          {/* This week */}
          <div className={statCard}>
            <h2 className={statLabel}>This week</h2>
            <div className="flex items-baseline gap-2">
              <span className={statValue}>{notesThisWeek}</span>
              <span className={statUnit}>{notesThisWeek === 1 ? 'note added' : 'notes added'}</span>
            </div>
            <p className="mt-auto text-sm text-gray-600 dark:text-gray-400">
              {incompleteCount > 0 ? (
                <Link href="/notes?status=unanswered" className="font-medium text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
                  {incompleteCount} incomplete {incompleteCount === 1 ? 'note' : 'notes'} →
                </Link>
              ) : (
                'No incomplete notes'
              )}
            </p>
          </div>
        </section>

        {/* Quota Display for free users */}
        {!isPremium && <QuotaDisplay showUpgradeLink={true} />}

        {error && (
          <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            Error loading notes: {error.message}
          </div>
        )}

        <section aria-labelledby="recent-notes-heading" className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-notes-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              Recent notes
            </h2>
            {notes.length > 0 && (
              <Link href="/notes" className="text-sm font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
                View all →
              </Link>
            )}
          </div>

          {notes.length === 0 ? (
            <div className="p-8 text-center bg-white border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-700">
              <p className="mb-4 text-gray-600 dark:text-gray-400">You haven&apos;t created any notes yet.</p>
              <Link href="/notes/new" passHref>
                <Button variant="primary">Create Your First Note</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]">
              {notes.slice(0, RECENT_NOTES).map((note) => (
                <NoteCard key={note.id} note={note} showPreview />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

const statCard =
  'flex flex-col gap-3 p-5 bg-white border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-700';
const statLabel = 'text-[13px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400';
const statValue = 'text-4xl font-bold leading-none text-gray-900 dark:text-gray-50';
const statUnit = 'text-sm text-gray-600 dark:text-gray-400';
