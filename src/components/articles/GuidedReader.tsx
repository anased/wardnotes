'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { ArticleGuide, GuideFact } from '@/lib/articles/types';

const KIND_LABELS: Record<GuideFact['kind'], string> = {
  design: 'Design',
  population: 'Population',
  intervention: 'Intervention',
  outcome: 'Outcome',
  result: 'Result',
  safety: 'Safety',
  limitation: 'Limitation',
  other: 'Fact',
};

/** One fact as a quote from the article. */
export function FactQuote({ fact }: { fact: GuideFact }) {
  return (
    <figure className="pl-3 border-l-4 border-primary-300 dark:border-primary-700">
      <blockquote className="text-sm text-gray-800 dark:text-gray-200">&ldquo;{fact.excerpt}&rdquo;</blockquote>
      <figcaption className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {KIND_LABELS[fact.kind]} · {fact.claim}
      </figcaption>
    </figure>
  );
}

/** The reading map, one stop at a time: where to read, what to look for, and the quotes that matter. */
export default function GuidedReader({ guide, onFinish }: { guide: ArticleGuide; onFinish?: () => void }) {
  const steps = guide.guide.steps;
  const [index, setIndex] = useState(0);
  const [showSection, setShowSection] = useState(false);
  const factsById = useMemo(() => new Map(guide.facts.map((f) => [f.id, f])), [guide.facts]);
  const sectionsById = useMemo(() => new Map(guide.sections.map((s) => [s.id, s])), [guide.sections]);
  const totalMinutes = steps.reduce((n, s) => n + s.minutes, 0);

  if (steps.length === 0) return null;
  const step = steps[index];
  const section = sectionsById.get(step.sectionId);
  const facts = step.factIds.map((id) => factsById.get(id)).filter((f): f is GuideFact => !!f);
  const last = index === steps.length - 1;

  const go = (i: number) => {
    setIndex(i);
    setShowSection(false);
  };

  return (
    <section aria-labelledby="reader-heading" className="p-4 space-y-4 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reader-heading" className="text-lg font-medium">
          Reading guide
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {steps.length} stops · about {totalMinutes} min
        </span>
      </div>

      <ol className="flex gap-1.5" aria-label="Stops">
        {steps.map((s, i) => (
          <li key={i} className="flex-1">
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Stop ${i + 1}: ${s.title}`}
              className={`block w-full h-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                i < index ? 'bg-primary-300 dark:bg-primary-700' : i === index ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Stop {index + 1} of {steps.length} · {step.minutes} min
          </p>
          <h3 className="mt-1 text-xl font-semibold">{step.title}</h3>
          {section && <p className="text-sm text-gray-600 dark:text-gray-400">Read: {section.heading}</p>}
        </div>

        <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30">
          <p className="text-sm font-medium text-primary-900 dark:text-primary-100">Look for</p>
          <p className="mt-1 text-gray-800 dark:text-gray-200">{step.lookFor}</p>
        </div>

        {facts.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">From the article</p>
            {facts.map((f) => (
              <FactQuote key={f.id} fact={f} />
            ))}
          </div>
        )}

        {section && (
          <div>
            <button
              type="button"
              aria-expanded={showSection}
              onClick={() => setShowSection((v) => !v)}
              className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
            >
              {showSection ? 'Hide' : 'Show'} the full section
            </button>
            {showSection && (
              <div className="p-3 mt-2 overflow-y-auto text-sm leading-relaxed text-gray-800 whitespace-pre-line rounded-lg max-h-96 bg-gray-50 dark:bg-gray-900/50 dark:text-gray-200">
                {section.text}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
          Previous
        </Button>
        {last ? (
          <Button onClick={onFinish}>Check yourself</Button>
        ) : (
          <Button onClick={() => go(index + 1)}>Next stop</Button>
        )}
      </div>
    </section>
  );
}
