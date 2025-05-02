'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import PageContainer from '@/components/layout/PageContainer';
import NoteForm from '@/components/notes/NoteForm';
import { Note } from '@/lib/supabase/client';

export default function EditNotePage() {
  const { user, loading: authLoading } = useAuth();
  const { fetchNoteById } = useNotes();
  const params = useParams();
  const router = useRouter();
  
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const loadNote = async () => {
      if (!params.id || Array.isArray(params.id)) {
        setError('Invalid note ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const noteData = await fetchNoteById(params.id);
        setNote(noteData);
      } catch (err) {
        console.error('Error loading note:', err);
        setError('Failed to load note');
      } finally {
        setLoading(false);
      }
    };

    if (user && params.id) {
      loadNote();
    }
  }, [user, params.id, fetchNoteById]);

  if (authLoading || loading) {
    return (
      <PageContainer title="Loading Note">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="Error">
        <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      </PageContainer>
    );
  }

  if (!note) {
    return (
      <PageContainer title="Note Not Found">
        <div className="p-4 text-yellow-700 bg-yellow-100 rounded-lg dark:bg-yellow-900 dark:text-yellow-200">
          The requested note could not be found.
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Edit Note">
      <NoteForm initialData={note} isEditing={true} />
    </PageContainer>
  );
}