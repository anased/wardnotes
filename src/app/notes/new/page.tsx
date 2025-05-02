'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import NoteForm from '@/components/notes/NoteForm';

export default function NewNotePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <PageContainer title="New Note">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Create New Note">
      <NoteForm />
    </PageContainer>
  );
}