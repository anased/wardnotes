'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import { FlashcardDashboard } from '@/components/flashcards/FlashcardDashboard';
import PageContainer from '@/components/layout/PageContainer';
import Spinner from '@/components/ui/Spinner';

export default function FlashcardsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <PageContainer title="Flashcards">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <PageContainer title="Flashcards">
      <FlashcardDashboard />
    </PageContainer>
  );
}