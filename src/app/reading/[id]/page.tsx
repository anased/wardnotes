'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import PrimerCard from '@/components/articles/PrimerCard';
import FullTextPanel from '@/components/articles/FullTextPanel';
import GuideBuilder from '@/components/articles/GuideBuilder';
import GuidedReader from '@/components/articles/GuidedReader';
import GuideOverview from '@/components/articles/GuideOverview';
import CheckYourself from '@/components/articles/CheckYourself';
import SavePanel from '@/components/articles/SavePanel';
import {
  deleteArticleRead,
  getArticleRead,
  getLatestGuide,
  notifyReadingChanged,
  setArticleStatus,
} from '@/lib/supabase/articleReads';
import {
  READ_STATUSES,
  READ_STATUS_LABELS,
  STUDY_KIND_LABELS,
  pubmedUrl,
  type ArticleGuide,
  type ArticleRead,
  type ReadStatus,
} from '@/lib/articles/types';

const linkClass = 'text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300';

function ArticlePageContent() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = typeof params.id === 'string' ? params.id : '';
  const alreadyAdded = searchParams?.get('existing') === '1';

  const [article, setArticle] = useState<ArticleRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ReadStatus | null>(null);
  const [showAbstract, setShowAbstract] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [guide, setGuide] = useState<ArticleGuide | null>(null);
  const quizRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !articleId) return;
    getArticleRead(articleId)
      .then(setArticle)
      .catch((err) => {
        console.error('Error loading article:', err);
        setError(err?.message || "Couldn't load the article.");
      })
      .finally(() => setLoading(false));
    getLatestGuide(articleId)
      .then(setGuide)
      .catch((err) => console.error('Error loading guide:', err));
  }, [user, articleId]);

  const reload = useCallback(async () => {
    const fresh = await getArticleRead(articleId);
    if (fresh) setArticle(fresh);
  }, [articleId]);

  const changeStatus = async (status: ReadStatus) => {
    if (!article || saving || status === article.status) return;
    setSaving(status);
    setError(null);
    try {
      setArticle(await setArticleStatus(article.id, status));
      notifyReadingChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the status.");
    } finally {
      setSaving(null);
    }
  };

  if (authLoading || loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  if (!article) {
    return (
      <PageContainer title="Article not found">
        <div className="p-4 text-yellow-700 bg-yellow-100 rounded-lg dark:bg-yellow-900 dark:text-yellow-200">
          {error || 'This article could not be found.'}{' '}
          <Link href="/reading" className="underline">
            Back to Reading
          </Link>
        </div>
      </PageContainer>
    );
  }

  const source = [article.journal, article.year].filter(Boolean).join(' · ');

  return (
    <PageContainer>
      <div className="max-w-3xl space-y-6">
        <div>
          <nav aria-label="Breadcrumb" className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/reading" className="hover:text-primary-700 hover:underline dark:hover:text-primary-300">
              Reading
            </Link>
            <span aria-hidden="true" className="mx-1.5 text-gray-400 dark:text-gray-500">
              ›
            </span>
            <span aria-current="page" className="text-gray-700 dark:text-gray-300">
              {READ_STATUS_LABELS[article.status]}
            </span>
          </nav>

          <h1 className="text-2xl font-bold break-words">{article.title}</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {STUDY_KIND_LABELS[article.study_kind]}
            {source && ` · ${source}`}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
            {article.pmid && (
              <a href={pubmedUrl(article.pmid)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                PubMed
              </a>
            )}
            {article.doi && (
              <a
                href={`https://doi.org/${article.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Journal (DOI)
              </a>
            )}
            {article.pmcid && (
              <a
                href={`https://pmc.ncbi.nlm.nih.gov/articles/${article.pmcid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Free full text (PMC)
              </a>
            )}
          </p>
        </div>

        {alreadyAdded && (
          <p role="status" className="px-3 py-2 text-sm rounded-lg text-primary-900 bg-primary-50 dark:bg-primary-900/40 dark:text-primary-100">
            This article was already in your Reading list.
          </p>
        )}

        <FullTextPanel article={article} onChange={setArticle} reload={reload} />

        {article.primer ? (
          <PrimerCard primer={article.primer} />
        ) : (
          <p className="p-4 text-sm text-gray-600 bg-white rounded-lg shadow dark:bg-gray-800 dark:text-gray-400">
            No primer for this article.
          </p>
        )}

        {guide ? (
          <>
            <GuidedReader
              guide={guide}
              onFinish={() => quizRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
            <GuideOverview guide={guide} />
            <CheckYourself ref={quizRef} guide={guide} />
          </>
        ) : (
          article.full_text_source !== 'none' && (
            <GuideBuilder
              articleId={article.id}
              onBuilt={(g) => {
                setGuide(g);
                setArticle((a) => (a && a.status === 'to_read' ? { ...a, status: 'reading' } : a));
                notifyReadingChanged();
              }}
            />
          )
        )}

        <SavePanel article={article} guide={guide} onChange={(patch) => setArticle((a) => (a ? { ...a, ...patch } : a))} />

        <section aria-labelledby="status-heading" className="space-y-2">
          <h2 id="status-heading" className="text-lg font-medium">
            Status
          </h2>
          <div className="flex flex-wrap gap-2">
            {READ_STATUSES.map((s) => (
              <Button
                key={s}
                variant={s === article.status ? 'primary' : 'outline'}
                aria-pressed={s === article.status}
                isLoading={saving === s}
                disabled={!!saving}
                onClick={() => changeStatus(s)}
              >
                {READ_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </section>

        {article.abstract && (
          <section className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <button
              type="button"
              aria-expanded={showAbstract}
              onClick={() => setShowAbstract((v) => !v)}
              className="flex items-center justify-between w-full text-left text-lg font-medium"
            >
              Abstract
              <span aria-hidden="true" className="text-gray-400">
                {showAbstract ? '−' : '+'}
              </span>
            </button>
            {showAbstract && (
              <p className="mt-3 text-gray-800 whitespace-pre-line dark:text-gray-200">{article.abstract}</p>
            )}
          </section>
        )}

        <div>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-sm text-red-700 hover:underline dark:text-red-400"
          >
            Remove from Reading
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        title="Remove article?"
        onConfirm={async () => {
          await deleteArticleRead(article.id);
          notifyReadingChanged();
          router.push('/reading');
        }}
      >
        &ldquo;{article.title}&rdquo; and its primer will be removed from your Reading list.
      </ConfirmDeleteModal>
    </PageContainer>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function ArticlePage() {
  return (
    <Suspense fallback={null}>
      <ArticlePageContent />
    </Suspense>
  );
}
