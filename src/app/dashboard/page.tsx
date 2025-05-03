'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import PageContainer from '@/components/layout/PageContainer';
import NoteCard from '@/components/notes/NoteCard';
import Button from '@/components/ui/Button';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { notes, loading: notesLoading, error } = useNotes();
  const router = useRouter();

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  // We've removed the second useEffect that was calling fetchNotes
  // since useNotes now handles fetching notes in its own useEffect

  if (authLoading || notesLoading) {
    return (
      <PageContainer title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Welcome to WardNotes</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Organize your clinical learning points
            </p>
          </div>
          <Link href="/notes/new">
            <Button>
              Create New Note
            </Button>
          </Link>
        </div>

        {error && (
          <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            Error loading notes: {error.message}
          </div>
        )}

        <div>
          <h3 className="mb-4 text-lg font-medium">Recent Notes</h3>
          
          {notes.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-lg shadow dark:bg-gray-800">
              <p className="mb-4 text-gray-600 dark:text-gray-400">
                You haven&apos;t created any notes yet.
              </p>
              <Link href="/notes/new">
                <Button variant="primary">
                  Create Your First Note
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {notes.slice(0, 6).map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
          
          {notes.length > 0 && (
            <div className="mt-6 text-center">
              <Link href="/notes" className="text-primary-600 hover:underline dark:text-primary-400">
                View All Notes &rarr;
              </Link>
            </div>
          )}
        </div>
        
        <div className="p-6 mt-8 bg-primary-50 rounded-lg dark:bg-gray-800">
          <h3 className="mb-4 text-lg font-medium">Quick Tips</h3>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Use tags to quickly filter related learning points</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Categories help organize by medical specialty</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Use the rich text editor to format your notes</span>
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}