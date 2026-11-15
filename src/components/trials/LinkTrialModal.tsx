import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import TrialFormModal from './TrialFormModal';
import useTrials from '@/lib/hooks/useTrials';
import { Trial } from '@/lib/supabase/trials';
import { matchTrials, trialLabel } from '@/lib/utils/trials';
import { normalizeTopicName } from '@/lib/utils/topicTree';

interface LinkTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicName: string;
  /** Trials already linked to the topic (hidden from the list). */
  linkedIds: Set<string>;
  /** Link an existing trial. */
  onLink: (trial: Trial) => Promise<void>;
  /** Called after a new trial was created already linked to the topic. */
  onCreated: () => void;
}

/**
 * Finds an existing trial to cite under a topic, so every topic links to the
 * same record; creates a new one only when it isn't there yet.
 */
export default function LinkTrialModal({
  isOpen,
  onClose,
  topicId,
  topicName,
  linkedIds,
  onLink,
  onCreated,
}: LinkTrialModalProps) {
  const { trials } = useTrials();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [createName, setCreateName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setError('');
    }
  }, [isOpen]);

  const available = trials.filter((t) => !linkedIds.has(t.id));
  const results = matchTrials(available, query, 30);
  const typed = normalizeTopicName(query);
  const alreadyLinked = typed ? matchTrials(trials.filter((t) => linkedIds.has(t.id)), typed, 1)[0] : undefined;

  if (createName !== null) {
    return (
      <TrialFormModal
        isOpen
        defaultAcronym={createName}
        defaultTopicIds={[topicId]}
        onClose={() => setCreateName(null)}
        onSaved={() => {
          setCreateName(null);
          onCreated();
          onClose();
        }}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Link a trial to ${topicName}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>
        )}
        <div>
          <label htmlFor="link-trial-search" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Search trials
          </label>
          <input
            id="link-trial-search"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Acronym or name, e.g. POINT"
            autoComplete="off"
          />
        </div>

        {results.length > 0 ? (
          <ul className="overflow-y-auto border border-gray-200 divide-y divide-gray-200 rounded-lg max-h-72 dark:border-gray-700 dark:divide-gray-700">
            {results.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{trialLabel(t)}</p>
                  {t.full_name && <p className="text-xs text-gray-500 truncate dark:text-gray-400">{t.full_name}</p>}
                </div>
                <Button
                  variant="outline"
                  className="px-3 py-1 text-sm"
                  isLoading={busyId === t.id}
                  disabled={!!busyId}
                  onClick={async () => {
                    try {
                      setBusyId(t.id);
                      await onLink(t);
                      onClose();
                    } catch (err) {
                      setError((err as Error).message || 'Could not link the trial.');
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Link
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {alreadyLinked
              ? `${trialLabel(alreadyLinked)} is already linked to ${topicName}.`
              : trials.length === 0
                ? 'No trials yet.'
                : 'No matching trials.'}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCreateName(typed)}
            className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {typed && results.length === 0 && !alreadyLinked ? `Create trial “${typed}”` : 'Create a new trial'}
          </button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
