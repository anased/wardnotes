import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Button from '../ui/Button';
import NoteTypeIcon from '../notes/NoteTypeIcon';
import useTrials from '@/lib/hooks/useTrials';
import { LinkedNoteSummary, searchNoteSummaries } from '@/lib/supabase/noteLinks';
import { Endpoint, LINK_RELATIONS, LinkDraft, OUTGOING_LABELS, draftKey, isLinkRelation } from '@/lib/utils/noteLinks';
import { matchTrials, trialLabel } from '@/lib/utils/trials';
import type { LinkRelation } from '@/lib/supabase/types';

interface LinkPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The note or trial the link starts from (excluded from the results). */
  source: Endpoint;
  /** "This note" / "POINT (2018)", for the preview sentence. */
  sourceLabel: string;
  /** Links that already exist from the source (draftKey), hidden from the results. */
  existing?: Set<string>;
  /** Called with the chosen link and a display title for its target. */
  onPick: (draft: LinkDraft, targetTitle: string) => Promise<void> | void;
}

const RELATION_OPTIONS = LINK_RELATIONS.map((r) => ({ value: r, label: OUTGOING_LABELS[r] }));

/** Choose a relation type and a target note or trial. */
export default function LinkPickerModal({ isOpen, onClose, source, sourceLabel, existing, onPick }: LinkPickerModalProps) {
  const { trials } = useTrials();
  const [relation, setRelation] = useState<LinkRelation>('related');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<LinkedNoteSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setError('');
  }, [isOpen]);

  // Search notes by title (debounced); recent notes when empty
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchNoteSummaries(query, 15)
        .then((rows) => {
          if (!cancelled) setNotes(rows);
        })
        .catch((err) => console.error('Error searching notes:', err))
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const isTaken = (type: 'note' | 'trial', id: string) =>
    (type === source.type && id === source.id) || !!existing?.has(draftKey({ relation, target_type: type, target_id: id }));

  const noteResults = notes.filter((n) => !isTaken('note', n.id));
  const trialResults = useMemo(
    () => matchTrials(trials, query, 10).filter((t) => !isTaken('trial', t.id)),
    [trials, query, relation, existing, source.id]
  );

  const pick = async (type: 'note' | 'trial', id: string, title: string) => {
    const key = `${type}:${id}`;
    try {
      setBusyKey(key);
      setError('');
      await onPick({ relation, target_type: type, target_id: id }, title);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Could not add the link.');
    } finally {
      setBusyKey(null);
    }
  };

  const row = (type: 'note' | 'trial', id: string, title: string, subtitle: string | null, contentType: string | null) => (
    <li key={`${type}:${id}`} className="flex items-center gap-3 px-3 py-2">
      <span className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-md text-primary-700 bg-primary-50 dark:bg-primary-900/60 dark:text-primary-200">
        <NoteTypeIcon type={type === 'trial' ? 'trial' : contentType} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate dark:text-gray-400">{subtitle}</p>}
      </div>
      <Button
        variant="outline"
        className="px-3 py-1 text-sm"
        isLoading={busyKey === `${type}:${id}`}
        disabled={!!busyKey}
        onClick={() => pick(type, id, title)}
        aria-label={`Link: ${sourceLabel} ${OUTGOING_LABELS[relation].toLowerCase()} ${title}`}
      >
        Link
      </Button>
    </li>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add link" maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Select
            label="Relation"
            value={relation}
            onChange={(e) => {
              if (isLinkRelation(e.target.value)) setRelation(e.target.value);
            }}
            options={RELATION_OPTIONS}
          />
          <div className="mb-4">
            <label htmlFor="link-target-search" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Target
            </label>
            <input
              id="link-target-search"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes and trials…"
              autoComplete="off"
            />
          </div>
        </div>

        <p className="-mt-2 text-sm text-gray-600 dark:text-gray-400">
          {sourceLabel} <span className="font-medium text-gray-900 dark:text-gray-100">{OUTGOING_LABELS[relation].toLowerCase()}</span> …
        </p>

        <div className="space-y-3 overflow-y-auto max-h-80">
          {trialResults.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">Trials</h4>
              <ul className="border border-gray-200 divide-y divide-gray-200 rounded-lg dark:border-gray-700 dark:divide-gray-700">
                {trialResults.map((t) => row('trial', t.id, trialLabel(t), t.full_name, null))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">Notes</h4>
            {noteResults.length > 0 ? (
              <ul className="border border-gray-200 divide-y divide-gray-200 rounded-lg dark:border-gray-700 dark:divide-gray-700">
                {noteResults.map((n) => row('note', n.id, n.title, n.status === 'unanswered' ? 'Unanswered' : null, n.content_type))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{searching ? 'Searching…' : 'No matching notes.'}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
