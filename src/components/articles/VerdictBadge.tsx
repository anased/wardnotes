import type { Verdict } from '@/lib/articles/types';

const STYLES: Record<Verdict, string> = {
  read: 'bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-100',
  skim: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
  skip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const LABELS: Record<Verdict, string> = { read: 'Read', skim: 'Skim', skip: 'Skip' };

/** "Read · 25 min", "Skim · 10 min" or "Skip". */
export function verdictText(verdict: Verdict, minutes: number): string {
  return verdict === 'skip' || minutes <= 0 ? LABELS[verdict] : `${LABELS[verdict]} · ${minutes} min`;
}

export default function VerdictBadge({ verdict, minutes }: { verdict: Verdict; minutes: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STYLES[verdict]}`}
    >
      {verdictText(verdict, minutes)}
    </span>
  );
}
