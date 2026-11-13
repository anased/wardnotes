'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import NoteForm from '@/components/notes/NoteForm';
import type { NoteTopicLink } from '@/lib/utils/noteTopicLinks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Topic (and optional section) to file the new note under: /notes/new?topic=…&section=… */
function topicLinksFromUrl(search: string): NoteTopicLink[] {
  const params = new URLSearchParams(search);
  const topic = params.get('topic') || '';
  const section = params.get('section') || '';
  if (!UUID_RE.test(topic)) return [];
  return [{ topic_id: topic, section_id: UUID_RE.test(section) ? section : null, is_primary: true }];
}

export default function NewNotePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Read after mount: the URL isn't available while rendering on the server
  const [topicLinks, setTopicLinks] = useState<NoteTopicLink[] | null>(null);

  useEffect(() => {
    setTopicLinks(topicLinksFromUrl(window.location.search));
  }, []);

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  if (loading || topicLinks === null) {
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
      <NoteForm initialTopicLinks={topicLinks} />
    </PageContainer>
  );
}
