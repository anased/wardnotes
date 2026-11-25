'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import Spinner from '@/components/ui/Spinner';
import AddArticleForm from '@/components/articles/AddArticleForm';
import ArticleRow from '@/components/articles/ArticleRow';
import { getArticleReads, notifyReadingChanged } from '@/lib/supabase/articleReads';
import { READ_STATUSES, READ_STATUS_LABELS, type ArticleRead, type ReadStatus } from '@/lib/articles/types';

const EMPTY: Record<ReadStatus, string> = {
  to_read: 'Nothing to read. Add an article above to get a primer.',
  reading: "You're not reading anything right now.",
  done: "You haven't finished any articles yet.",
  skipped: "You haven't skipped any articles.",
};

function isReadStatus(value: string | null): value is ReadStatus {
  return !!value && (READ_STATUSES as readonly string[]).includes(value);
}

function ReadingPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams?.get('status') ?? null;
  const status: ReadStatus = isReadStatus(statusParam) ? statusParam : 'to_read';

  const [articles, setArticles] = useState<ArticleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    getArticleReads()
      .then(setArticles)
      .catch((err) => {
        console.error('Error loading reading list:', err);
        setError(err?.message || "Couldn't load your reading list.");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const counts = useMemo(() => {
    const c: Record<ReadStatus, number> = { to_read: 0, reading: 0, done: 0, skipped: 0 };
    for (const a of articles) c[a.status] += 1;
    return c;
  }, [articles]);
  const shown = articles.filter((a) => a.status === status);

  const setStatus = (next: ReadStatus) => {
    router.replace(next === 'to_read' ? '/reading' : `/reading?status=${next}`);
  };

  return (
    <PageContainer title="Reading">
      <div className="max-w-3xl space-y-6">
        <AddArticleForm
          onAdded={({ article, existing }) => {
            notifyReadingChanged();
            router.push(`/reading/${article.id}${existing ? '?existing=1' : ''}`);
          }}
        />

        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {READ_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === status}
              onClick={() => setStatus(s)}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600
                ${
                  s === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700'
                }`}
            >
              {READ_STATUS_LABELS[s]}
              <span className={s === status ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}>{counts[s]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner size="md" color="primary" />
          </div>
        ) : error ? (
          <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-gray-600 bg-white rounded-lg shadow dark:bg-gray-800 dark:text-gray-400">
            {EMPTY[status]}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function ReadingPage() {
  return (
    <Suspense fallback={null}>
      <ReadingPageContent />
    </Suspense>
  );
}
