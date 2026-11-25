'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useQuota } from '@/lib/hooks/useQuota';
import { requestGuide } from '@/lib/supabase/articleReads';
import type { ArticleGuide, GuideBudget } from '@/lib/articles/types';

/** "Build a guide" card. Phase 2 offers the 20-minute guide; 10 and 45 come in phase 3. */
export default function GuideBuilder({ articleId, onBuilt }: { articleId: string; onBuilt: (guide: ArticleGuide) => void }) {
  const { getRemainingUses, refreshQuota } = useQuota();
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const budget: GuideBudget = 20;
  const remaining = getRemainingUses('note_improvement');

  const build = async () => {
    setBuilding(true);
    setError('');
    try {
      onBuilt(await requestGuide(articleId, budget));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the guide. Please try again.");
    } finally {
      setBuilding(false);
      refreshQuota().catch(() => undefined);
    }
  };

  return (
    <section aria-labelledby="build-heading" className="p-4 space-y-3 bg-white rounded-lg shadow dark:bg-gray-800">
      <h2 id="build-heading" className="text-lg font-medium">
        Reading guide
      </h2>
      <p className="text-gray-700 dark:text-gray-300">
        Get a {budget}-minute plan for this paper: which sections to read and what to look for, the key numbers in plain
        words, an appraisal, questions for rounds, and a short quiz.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={build} isLoading={building} disabled={remaining === 0}>
          {building ? 'Building your guide…' : `Build a ${budget}-minute guide`}
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {building
            ? 'This takes a minute or two. You can keep reading the primer.'
            : remaining === null
              ? 'Uses 1 AI-assist credit.'
              : remaining === 0
                ? "You've used this month's AI-assist credits."
                : `Uses 1 AI-assist credit (${remaining} left this month).`}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
