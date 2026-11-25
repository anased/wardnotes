'use client';

import { forwardRef, useMemo, useState } from 'react';
import type { ArticleGuide, GuideFact } from '@/lib/articles/types';
import { FactQuote } from './GuidedReader';

/** Five multiple-choice questions; each answer is revealed with the quote it rests on. */
const CheckYourself = forwardRef<HTMLElement, { guide: ArticleGuide }>(function CheckYourself({ guide }, ref) {
  const quiz = guide.guide.quiz;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const factsById = useMemo(() => new Map(guide.facts.map((f) => [f.id, f])), [guide.facts]);
  const answered = Object.keys(answers).length;
  const correct = quiz.filter((q, i) => answers[i] === q.answerIndex).length;

  if (quiz.length === 0) return null;

  return (
    <section ref={ref} aria-labelledby="quiz-heading" className="p-4 space-y-5 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quiz-heading" className="text-lg font-medium">
          Check yourself
        </h2>
        {answered > 0 && (
          <span className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
            {correct} of {answered} right
          </span>
        )}
      </div>
      {quiz.map((q, i) => {
        const picked = answers[i];
        const done = picked !== undefined;
        const fact: GuideFact | undefined = q.factId ? factsById.get(q.factId) : undefined;
        return (
          <fieldset key={i} className="space-y-2">
            <legend className="font-medium text-gray-900 dark:text-gray-100">
              {i + 1}. {q.question}
            </legend>
            <div className="grid gap-2">
              {q.options.map((option, j) => {
                const isAnswer = j === q.answerIndex;
                const state = !done
                  ? 'bg-white ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:ring-gray-600 dark:hover:bg-gray-700'
                  : isAnswer
                    ? 'bg-primary-50 ring-primary-500 dark:bg-primary-900/40'
                    : j === picked
                      ? 'bg-red-50 ring-red-400 dark:bg-red-900/30'
                      : 'bg-white ring-gray-200 opacity-70 dark:bg-gray-800 dark:ring-gray-700';
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={done}
                    aria-pressed={j === picked}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    className={`text-left px-3 py-2 rounded-lg ring-1 text-gray-800 dark:text-gray-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${state}`}
                  >
                    {option}
                    {done && isAnswer && <span className="sr-only"> (correct answer)</span>}
                    {done && j === picked && !isAnswer && <span className="sr-only"> (your answer, incorrect)</span>}
                  </button>
                );
              })}
            </div>
            {done && (
              <div className="space-y-2" aria-live="polite">
                <p className={`text-sm font-medium ${picked === q.answerIndex ? 'text-primary-700 dark:text-primary-300' : 'text-red-700 dark:text-red-400'}`}>
                  {picked === q.answerIndex ? 'Right.' : 'Not quite.'} <span className="font-normal text-gray-700 dark:text-gray-300">{q.explanation}</span>
                </p>
                {fact && <FactQuote fact={fact} />}
              </div>
            )}
          </fieldset>
        );
      })}
    </section>
  );
});

export default CheckYourself;
