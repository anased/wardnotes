import type { ArticleGuide, BiasRisk, GuidePoint } from '@/lib/articles/types';

const BIAS: Record<BiasRisk, { label: string; className: string }> = {
  low: { label: 'Low risk of bias', className: 'bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-100' },
  some_concerns: {
    label: 'Some concerns',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
  },
  high: { label: 'High risk of bias', className: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-100' },
};

function Points({ title, points }: { title: string; points: GuidePoint[] }) {
  if (points.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h4>
      <ul className="mt-1 space-y-1 list-disc list-inside text-gray-800 dark:text-gray-200">
        {points.map((p, i) => (
          <li key={i}>{p.text}</li>
        ))}
      </ul>
    </div>
  );
}

/** Stats decoder, appraisal and rounds Q&A. */
export default function GuideOverview({ guide }: { guide: ArticleGuide }) {
  const { stats, appraisal, qa } = guide.guide;
  const bias = BIAS[appraisal.biasRisk];
  return (
    <>
      {stats.length > 0 && (
        <section aria-labelledby="stats-heading" className="p-4 space-y-3 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 id="stats-heading" className="text-lg font-medium">
            Key numbers
          </h2>
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            {stats.map((s, i) => (
              <div key={i} className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400">{s.label}</dt>
                <dd className="sm:col-span-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{s.value}</span>
                  <span className="block text-sm text-gray-700 dark:text-gray-300">{s.meaning}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="appraisal-heading" className="p-4 space-y-3 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="appraisal-heading" className="text-lg font-medium">
            Appraisal
          </h2>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${bias.className}`}>{bias.label}</span>
        </div>
        {appraisal.biasReason && <p className="text-gray-800 dark:text-gray-200">{appraisal.biasReason}</p>}
        <Points title="Strengths" points={appraisal.strengths} />
        <Points title="Weaknesses" points={appraisal.weaknesses} />
      </section>

      {qa.length > 0 && (
        <section aria-labelledby="qa-heading" className="p-4 space-y-2 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 id="qa-heading" className="text-lg font-medium">
            Questions for rounds
          </h2>
          {qa.map((q, i) => (
            <details key={i} className="group">
              <summary className="py-1 font-medium text-gray-900 cursor-pointer dark:text-gray-100">{q.question}</summary>
              <p className="pb-2 pl-4 text-gray-700 dark:text-gray-300">{q.answer}</p>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
