import { ReactNode, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { TipTapNode } from '@/types/content';
import { convertTipTapToPlainText } from '@/lib/utils/content-converter';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useQuota } from '@/lib/hooks/useQuota';
import { useNotification } from '@/lib/context/NotificationContext';
import PremiumFeatureGate from '../premium/PremiumFeatureGate';
import InlineQuotaIndicator from '../premium/InlineQuotaIndicator';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LearnFromEncounterModal from './LearnFromEncounterModal';

/** Longest note (in plain-text characters) the improve endpoint accepts. */
export const MAX_IMPROVE_CHARACTERS = 4000;

interface NoteAiMenuProps {
  content: Record<string, unknown>;
  /** Replaces the note with AI-written Markdown (improved note or answers). */
  onApplyMarkdown: (markdown: string) => void;
}

const SparkleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path
      strokeLinecap="round"
      d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"
    />
  </svg>
);

interface MenuItemProps {
  title: string;
  description: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const MenuItem = ({ title, description, onClick, disabled, className = '' }: MenuItemProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left px-3 py-2.5 rounded-lg flex flex-col gap-0.5 hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:hover:bg-gray-700 dark:focus-visible:bg-gray-700 ${className}`}
  >
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
    <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
  </button>
);

/**
 * The editor toolbar's "AI" menu: learn from an encounter (AI answers your
 * questions into the note) and improve the note (preview, then apply).
 */
export default function NoteAiMenu({ content, onApplyMarkdown }: NoteAiMenuProps) {
  const [open, setOpen] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [improvedContent, setImprovedContent] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { track } = useAnalytics();
  const { subscription, isPremium } = useSubscription();
  const { refreshQuota } = useQuota();
  const { showNotification } = useNotification();

  const subscriptionStatus = subscription?.subscription_status === 'active' ? 'premium' : 'free';
  const plainText = convertTipTapToPlainText(content as TipTapNode);
  const characterCount = plainText.length;
  const isOverLimit = characterCount > MAX_IMPROVE_CHARACTERS;

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleImproveNote = async () => {
    setOpen(false);
    if (isOverLimit) {
      showNotification(`Note exceeds maximum character limit of ${MAX_IMPROVE_CHARACTERS} characters`, 'error');
      return;
    }
    if (characterCount === 0) {
      showNotification('Cannot improve empty note', 'error');
      return;
    }

    try {
      setIsImproving(true);
      track('ai_note_improve_started', { note_id: 'current', subscription_status: subscriptionStatus });

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Session error: ${sessionError.message}`);
      if (!session) throw new Error('You must be logged in to improve notes');

      const response = await fetch('/api/improve-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: plainText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          showNotification(
            errorData.message || 'Monthly note improvement limit reached. Upgrade to Premium for unlimited access.',
            'error',
            8000
          );
          return;
        }
        throw new Error(errorData.error || 'Failed to improve note');
      }

      const data = await response.json();
      setImprovedContent(data.improvedNote);
      await refreshQuota();
      track('ai_note_improve_completed', { note_id: 'current', subscription_status: subscriptionStatus });
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'An unexpected error occurred', 'error');
    } finally {
      setIsImproving(false);
    }
  };

  const countLabel = `${characterCount.toLocaleString()} / ${MAX_IMPROVE_CHARACTERS.toLocaleString()} characters`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={isImproving}
        className="inline-flex items-center h-8 gap-1.5 px-3 text-sm font-semibold rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-70 dark:bg-primary-900/40 dark:border-primary-800 dark:text-primary-200 dark:hover:bg-primary-900/60"
      >
        {isImproving ? (
          <span className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin" aria-hidden="true" />
        ) : (
          <SparkleIcon />
        )}
        {isImproving ? 'Improving…' : 'AI'}
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 p-1.5 flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-gray-800 dark:border-gray-700">
          <MenuItem
            title="Learn from an encounter…"
            description="Add context and questions; AI answers them into the note"
            onClick={() => {
              setOpen(false);
              setShowLearn(true);
            }}
          />
          <PremiumFeatureGate
            featureName="AI Note Improvement"
            description="Use AI to structure and enhance your medical notes for better clarity and organization."
            featureType="note_improvement"
            showPremiumBadge={false}
          >
            <MenuItem
              title="Improve note"
              description={
                <>
                  <span className={isOverLimit ? 'text-red-600 dark:text-red-400' : undefined}>
                    Tighten, structure and fix gaps · {countLabel}
                  </span>
                  {!isPremium && <InlineQuotaIndicator featureType="note_improvement" className="ml-1" />}
                </>
              }
              onClick={handleImproveNote}
              disabled={isOverLimit || characterCount === 0}
            />
          </PremiumFeatureGate>
        </div>
      )}

      <LearnFromEncounterModal
        isOpen={showLearn}
        onClose={() => setShowLearn(false)}
        onAnswered={onApplyMarkdown}
      />

      <Modal
        isOpen={improvedContent !== null}
        onClose={() => setImprovedContent(null)}
        title="Improved note preview"
        maxWidth="max-w-3xl"
      >
        <div className="p-4 mb-4 whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-700">{improvedContent}</div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setImprovedContent(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (improvedContent !== null) onApplyMarkdown(improvedContent);
              setImprovedContent(null);
            }}
          >
            Apply improvements
          </Button>
        </div>
      </Modal>
    </div>
  );
}
