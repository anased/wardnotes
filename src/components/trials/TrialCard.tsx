import Link from 'next/link';
import { Trial } from '@/lib/supabase/trials';
import { trialLabel } from '@/lib/utils/trials';

interface TrialCardProps {
  trial: Trial;
  /** Names of the topics citing the trial. */
  topicNames: string[];
  supersededBy?: Trial | null;
}

/** Compact trial summary for grids; same card style as NoteCard. */
export default function TrialCard({ trial, topicNames, supersededBy }: TrialCardProps) {
  const shown = topicNames.slice(0, 3);
  const hidden = topicNames.length - shown.length;

  return (
    <article className="relative flex flex-col h-full p-4 bg-white border border-gray-200 rounded-lg shadow-sm transition hover:shadow-md hover:border-gray-300 focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 dark:focus-within:ring-primary-400 dark:focus-within:ring-offset-gray-900">
      <div className="flex flex-wrap items-center gap-1.5 mb-2 min-w-0">
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-300 rounded dark:text-gray-300 dark:border-gray-600">
          Trial
        </span>
        {supersededBy && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-amber-900 bg-amber-100 rounded dark:bg-amber-900/60 dark:text-amber-100">
            Superseded by {supersededBy.acronym}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug text-gray-900 break-words dark:text-gray-100">
        <Link
          href={`/trials/${trial.id}`}
          className="focus:outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {trialLabel(trial)}
        </Link>
      </h3>
      {trial.full_name && (
        <p className="mt-1 text-sm text-gray-600 line-clamp-2 dark:text-gray-400">{trial.full_name}</p>
      )}
      {trial.result && (
        <p className="mt-2 text-sm text-gray-700 line-clamp-3 dark:text-gray-300">{trial.result}</p>
      )}

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-3 mt-auto">
          {shown.map((name) => (
            <span
              key={name}
              className="max-w-[10rem] truncate px-2 py-0.5 text-xs rounded-full bg-gray-50 text-gray-700 ring-1 ring-gray-200 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600"
            >
              {name}
            </span>
          ))}
          {hidden > 0 && <span className="px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-400">+{hidden}</span>}
        </div>
      )}
    </article>
  );
}
