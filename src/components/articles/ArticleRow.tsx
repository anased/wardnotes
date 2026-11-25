import Link from 'next/link';
import { STUDY_KIND_LABELS, type ArticleRead } from '@/lib/articles/types';
import VerdictBadge from './VerdictBadge';

/** One article in the Reading inbox. */
export default function ArticleRow({ article }: { article: ArticleRead }) {
  const source = [article.journal, article.year].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        href={`/reading/${article.id}`}
        className="block p-4 transition bg-white rounded-lg shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:bg-gray-800"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 font-medium text-gray-900 break-words dark:text-gray-100">{article.title}</h2>
          {article.primer && <VerdictBadge verdict={article.primer.verdict} minutes={article.primer.minutes} />}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {STUDY_KIND_LABELS[article.study_kind]}
          {source && ` · ${source}`}
        </p>
        {article.primer?.bottomLine && (
          <p className="mt-2 text-sm text-gray-700 line-clamp-2 dark:text-gray-300">{article.primer.bottomLine}</p>
        )}
      </Link>
    </li>
  );
}
