import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LearningQuestionsInput from './LearningQuestionsInput';
import PremiumFeatureGate from '../premium/PremiumFeatureGate';
import { supabase } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useQuota } from '@/lib/hooks/useQuota';

interface LearnFromEncounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the answers as Markdown, to put into the note. */
  onAnswered: (markdown: string) => void;
}

/** Formats the clinical context and answers as Markdown for the editor. */
export function formatAnswersAsMarkdown(
  context: string,
  answers: Array<{ question: string; answer: string }>
): string {
  let markdown = `## Clinical Context\n${context}\n\n## Learning Questions & Answers\n\n`;
  answers.forEach((qa, index) => {
    markdown += `### Q${index + 1}: ${qa.question}\n\n${qa.answer}\n\n`;
  });
  return markdown;
}

/**
 * "Learn from an encounter": a brief clinical context plus up to five
 * questions; AI answers them and the answers fill the note.
 */
export default function LearnFromEncounterModal({ isOpen, onClose, onAnswered }: LearnFromEncounterModalProps) {
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const { refreshQuota } = useQuota();
  const [clinicalContext, setClinicalContext] = useState('');
  const [learningQuestions, setLearningQuestions] = useState<string[]>(['']);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus = subscription?.subscription_status === 'active' ? 'premium' : 'free';

  const handleAnswerQuestions = async () => {
    const validQuestions = learningQuestions.filter((q) => q.trim().length > 0);

    if (!clinicalContext.trim()) {
      setError('Please enter clinical context');
      return;
    }
    if (validQuestions.length === 0) {
      setError('Please enter at least one question');
      return;
    }

    try {
      setIsAnswering(true);
      setError(null);

      track('learning_questions_started', {
        question_count: validQuestions.length,
        subscription_status: subscriptionStatus,
      });

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('You must be logged in');
      }

      const response = await fetch('/api/answer-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clinicalContext: clinicalContext.trim(),
          questions: validQuestions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          setError(errorData.message || 'Monthly limit reached. Upgrade to Premium for unlimited access.');
          return;
        }
        throw new Error(errorData.error || 'Failed to answer questions');
      }

      const data = await response.json();
      onAnswered(formatAnswersAsMarkdown(clinicalContext.trim(), data.answers));

      await refreshQuota();

      track('learning_questions_answered', {
        question_count: validQuestions.length,
        generation_time: data.metadata.generationTime,
        subscription_status: subscriptionStatus,
      });

      // Reset and close
      setClinicalContext('');
      setLearningQuestions(['']);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isAnswering) onClose();
      }}
      title="Learn from an encounter"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter a brief clinical context and what you want to learn. AI answers your questions and adds them to the note.
        </p>

        <div>
          <label htmlFor="encounter-context" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Clinical context
          </label>
          <textarea
            id="encounter-context"
            value={clinicalContext}
            onChange={(e) => setClinicalContext(e.target.value)}
            placeholder="e.g., 65-year-old patient with newly diagnosed glioma presenting with first-time generalized seizure after missing ASM doses..."
            rows={3}
            maxLength={2000}
            disabled={isAnswering}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{clinicalContext.length}/2000 characters</p>
        </div>

        <LearningQuestionsInput
          questions={learningQuestions}
          onQuestionsChange={setLearningQuestions}
          maxQuestions={5}
          disabled={isAnswering}
        />

        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900/50 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isAnswering}>
            Cancel
          </Button>
          <PremiumFeatureGate
            featureName="Learning Questions"
            description="Get AI-powered answers to your clinical learning questions."
            featureType="note_improvement"
          >
            <Button
              type="button"
              onClick={handleAnswerQuestions}
              isLoading={isAnswering}
              disabled={!clinicalContext.trim() || learningQuestions.every((q) => !q.trim())}
              variant="primary"
            >
              Answer into my note
            </Button>
          </PremiumFeatureGate>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The answers replace what&apos;s in the editor. Review them before saving.
        </p>
      </div>
    </Modal>
  );
}
