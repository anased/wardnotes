import type { Primer } from '@/lib/articles/types';
import VerdictBadge from './VerdictBadge';

/** The primer: question, bottom line, and the read / skim / skip verdict. */
export default function PrimerCard({ primer }: { primer: Primer }) {
  return (
    <section aria-labelledby="primer-heading" className="p-4 space-y-4 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="primer-heading" className="text-lg font-medium">
          Primer
        </h2>
        <VerdictBadge verdict={primer.verdict} minutes={primer.minutes} />
      </div>
      <dl className="space-y-4">
        {primer.question && (
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Question</dt>
            <dd className="mt-1 text-gray-900 dark:text-gray-100">{primer.question}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Bottom line</dt>
          <dd className="mt-1 text-gray-900 dark:text-gray-100">{primer.bottomLine}</dd>
        </div>
        {primer.verdictReason && (
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Why {primer.verdict}</dt>
            <dd className="mt-1 text-gray-900 dark:text-gray-100">{primer.verdictReason}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        AI-generated from the abstract. Every number was checked against the source
        {primer.droppedSentences > 0
          ? `; ${primer.droppedSentences} sentence${primer.droppedSentences === 1 ? '' : 's'} that didn't match ${primer.droppedSentences === 1 ? 'was' : 'were'} removed.`
          : '.'}
      </p>
    </section>
  );
}
