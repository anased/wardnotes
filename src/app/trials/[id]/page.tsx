'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useTopics from '@/lib/hooks/useTopics';
import useTrials from '@/lib/hooks/useTrials';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import TopicSidebar from '@/components/topics/TopicSidebar';
import TrialFormModal from '@/components/trials/TrialFormModal';
import { PencilIcon } from '@/components/topics/icons';
import { getTrialTopicsForDisplay } from '@/lib/supabase/trials';
import { supersededTrials, trialLabel } from '@/lib/utils/trials';

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-gray-900 whitespace-pre-line dark:text-gray-100">{value}</dd>
    </div>
  );
}

export default function TrialPage() {
  const { user, loading: authLoading } = useAuth();
  const { graph } = useTopics();
  const { trials, byId, loading } = useTrials();
  const params = useParams();
  const router = useRouter();
  const trialId = typeof params.id === 'string' ? params.id : '';
  const trial = byId.get(trialId);

  const [topics, setTopics] = useState<{ topic_id: string; section_name: string | null }[]>([]);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth');
  }, [user, authLoading, router]);

  const loadTopics = useCallback(() => {
    if (!user || !trialId) return;
    getTrialTopicsForDisplay(trialId)
      .then(setTopics)
      .catch((err) => console.error('Error loading trial topics:', err));
  }, [user, trialId]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  if (authLoading || (loading && !trial)) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  if (!trial) {
    return (
      <PageContainer title="Trial Not Found">
        <div className="p-4 text-yellow-700 bg-yellow-100 rounded-lg dark:bg-yellow-900 dark:text-yellow-200">
          The requested trial could not be found.{' '}
          <Link href="/trials" className="underline">
            Back to trials
          </Link>
        </div>
      </PageContainer>
    );
  }

  const replacement = trial.superseded_by ? byId.get(trial.superseded_by) : undefined;
  const replaced = supersededTrials(trials, trial.id);
  const citedBy = topics.filter((t) => graph.byId.has(t.topic_id));
  const linkClass = 'text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300';

  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TopicSidebar />

        <div className="min-w-0 space-y-6">
          <div>
            <nav aria-label="Breadcrumb" className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/trials" className="hover:text-primary-700 hover:underline dark:hover:text-primary-300">
                Trials
              </Link>
              <span aria-hidden="true" className="mx-1.5 text-gray-400 dark:text-gray-500">
                ›
              </span>
              <span aria-current="page" className="text-gray-700 dark:text-gray-300">
                {trial.acronym}
              </span>
            </nav>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold break-words">{trialLabel(trial)}</h1>
                {trial.full_name && <p className="mt-1 text-gray-600 dark:text-gray-400">{trial.full_name}</p>}
              </div>
              <Button variant="outline" onClick={() => setShowEdit(true)} className="inline-flex items-center flex-shrink-0">
                <PencilIcon className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>

            {replacement && (
              <div className="flex items-center gap-2 px-3 py-2 mt-4 text-sm rounded-lg text-amber-900 bg-amber-100 dark:bg-amber-900/60 dark:text-amber-100">
                <span aria-hidden="true" className="w-1.5 h-1.5 bg-amber-600 rounded-full dark:bg-amber-300" />
                <span>
                  Superseded by{' '}
                  <Link href={`/trials/${replacement.id}`} className="font-medium underline">
                    {trialLabel(replacement)}
                  </Link>
                </span>
              </div>
            )}
            {replaced.length > 0 && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Supersedes:{' '}
                {replaced.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ', '}
                    <Link href={`/trials/${t.id}`} className={linkClass}>
                      {trialLabel(t)}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>

          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            {trial.population || trial.intervention || trial.comparator || trial.result || trial.notes ? (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Detail label="Population" value={trial.population} />
                </div>
                <Detail label="Intervention" value={trial.intervention} />
                <Detail label="Comparator" value={trial.comparator} />
                <div className="sm:col-span-2">
                  <Detail label="Primary result" value={trial.result} />
                </div>
                <div className="sm:col-span-2">
                  <Detail label="Notes" value={trial.notes} />
                </div>
              </dl>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No details yet.{' '}
                <button type="button" onClick={() => setShowEdit(true)} className={linkClass}>
                  Add population, intervention and result
                </button>
              </p>
            )}
          </div>

          <section aria-labelledby="trial-topics-heading" className="space-y-3">
            <h2 id="trial-topics-heading" className="text-lg font-medium">
              Cited under
            </h2>
            {citedBy.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Not linked to any topic yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {citedBy.map((t) => (
                  <Link
                    key={t.topic_id}
                    href={`/topics/${t.topic_id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-sm text-gray-700 rounded-full bg-gray-50 ring-1 ring-gray-200 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
                  >
                    {graph.byId.get(t.topic_id)!.name}
                    {t.section_name && <span className="text-gray-500 dark:text-gray-400">· {t.section_name}</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <TrialFormModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        trial={trial}
        onSaved={() => loadTopics()}
        onDeleted={() => router.push('/trials')}
      />
    </PageContainer>
  );
}
