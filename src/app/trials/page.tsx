'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useTopics from '@/lib/hooks/useTopics';
import useTrials from '@/lib/hooks/useTrials';
import PageContainer from '@/components/layout/PageContainer';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import TopicSidebar from '@/components/topics/TopicSidebar';
import TrialCard from '@/components/trials/TrialCard';
import TrialFormModal from '@/components/trials/TrialFormModal';
import { PlusIcon } from '@/components/topics/icons';
import { getAllTrialTopicIds } from '@/lib/supabase/trials';
import { matchTrials } from '@/lib/utils/trials';

export default function TrialsPage() {
  const { user, loading: authLoading } = useAuth();
  const { graph } = useTopics();
  const { trials, byId, loading, error } = useTrials();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [topicIds, setTopicIds] = useState<Record<string, string[]>>({});
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    getAllTrialTopicIds()
      .then(setTopicIds)
      .catch((err) => console.error('Error loading trial topics:', err));
  }, [user, trials]);

  const shown = useMemo(() => matchTrials(trials, query, trials.length || 1), [trials, query]);

  return (
    <PageContainer title="Trials">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TopicSidebar />

        <div className="min-w-0 space-y-6">
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Input
                  aria-label="Search trials"
                  placeholder="Search by acronym or name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="mb-0"
                />
              </div>
              <div>
                <Button onClick={() => setShowCreate(true)} className="inline-flex items-center">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  New trial
                </Button>
              </div>
            </div>
            <p className="-mt-2 text-sm text-gray-600 dark:text-gray-400">
              One record per trial. Every topic that cites it links to the same record.
            </p>
          </div>

          {loading && trials.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Spinner size="md" color="primary" />
            </div>
          ) : error ? (
            <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              Error loading trials: {error.message}
            </div>
          ) : shown.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-lg shadow dark:bg-gray-800">
              <p className="mb-4 text-gray-600 dark:text-gray-400">
                {query ? 'No trials match your search.' : "You haven't added any trials yet."}
              </p>
              {!query && <Button onClick={() => setShowCreate(true)}>Add Your First Trial</Button>}
            </div>
          ) : (
            <div className="note-grid">
              {shown.map((t) => (
                <TrialCard
                  key={t.id}
                  trial={t}
                  topicNames={(topicIds[t.id] ?? []).map((id) => graph.byId.get(id)?.name).filter((n): n is string => !!n)}
                  supersededBy={t.superseded_by ? byId.get(t.superseded_by) : null}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TrialFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(t) => router.push(`/trials/${t.id}`)}
      />
    </PageContainer>
  );
}
