import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import NoteTopicPicker from '../topics/NoteTopicPicker';
import useTrials from '@/lib/hooks/useTrials';
import { Trial, getTrialTopics, trialErrorMessage } from '@/lib/supabase/trials';
import { NoteTopicLink, withTopicIds } from '@/lib/utils/noteTopicLinks';
import { findDuplicateTrial, parseTrialYear, supersedeCandidates, trialLabel } from '@/lib/utils/trials';
import { normalizeTopicName } from '@/lib/utils/topicTree';

interface TrialFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Trial to edit; omit to create one. */
  trial?: Trial | null;
  defaultAcronym?: string;
  /** Topics to link a new trial to (e.g. the topic page it was created from). */
  defaultTopicIds?: string[];
  onSaved?: (trial: Trial) => void;
  onDeleted?: () => void;
}

const FIELDS = [
  { key: 'population', label: 'Population', placeholder: 'e.g. Minor ischaemic stroke or high-risk TIA within 12 h' },
  { key: 'intervention', label: 'Intervention', placeholder: 'e.g. Clopidogrel + aspirin for 90 days' },
  { key: 'comparator', label: 'Comparator', placeholder: 'e.g. Aspirin alone' },
  { key: 'result', label: 'Primary result', placeholder: 'e.g. Fewer major ischaemic events (5.0% vs 6.5%); more major bleeding' },
  { key: 'notes', label: 'Notes', placeholder: 'Caveats, subgroup findings, how it changed practice…' },
] as const;

type TextKey = (typeof FIELDS)[number]['key'];

/** Create or edit a trial record: details, what superseded it, and the topics that cite it. */
export default function TrialFormModal({
  isOpen,
  onClose,
  trial,
  defaultAcronym = '',
  defaultTopicIds = [],
  onSaved,
  onDeleted,
}: TrialFormModalProps) {
  const { trials, createTrial, updateTrial, deleteTrial } = useTrials();
  const editing = !!trial;

  const [acronym, setAcronym] = useState('');
  const [fullName, setFullName] = useState('');
  const [year, setYear] = useState('');
  const [text, setText] = useState<Record<TextKey, string>>({
    population: '',
    intervention: '',
    comparator: '',
    result: '',
    notes: '',
  });
  const [supersededBy, setSupersededBy] = useState('');
  const [topics, setTopics] = useState<NoteTopicLink[]>([]);
  const [topicsLoaded, setTopicsLoaded] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAcronym(trial?.acronym ?? defaultAcronym);
    setFullName(trial?.full_name ?? '');
    setYear(trial?.year ? String(trial.year) : '');
    setText({
      population: trial?.population ?? '',
      intervention: trial?.intervention ?? '',
      comparator: trial?.comparator ?? '',
      result: trial?.result ?? '',
      notes: trial?.notes ?? '',
    });
    setSupersededBy(trial?.superseded_by ?? '');
    setError('');
    setConfirmDelete(false);
    if (trial) {
      setTopicsLoaded(false);
      getTrialTopics(trial.id)
        .then((links) => setTopics(withTopicIds(links.map((l) => ({ ...l, is_primary: false })), links.map((l) => l.topic_id))))
        .catch((err) => setError(trialErrorMessage(err)))
        .finally(() => setTopicsLoaded(true));
    } else {
      setTopics(withTopicIds([], defaultTopicIds));
      setTopicsLoaded(true);
    }
  }, [isOpen, trial?.id]);

  const parsedYear = parseTrialYear(year);
  const yearInvalid = Number.isNaN(parsedYear);
  const duplicate = useMemo(
    () => (yearInvalid ? undefined : findDuplicateTrial(trials, acronym, parsedYear as number | null, trial?.id)),
    [trials, acronym, parsedYear, yearInvalid, trial?.id]
  );
  const candidates = useMemo(() => supersedeCandidates(trials, trial?.id), [trials, trial?.id]);

  const handleSave = async () => {
    const name = normalizeTopicName(acronym);
    if (!name) {
      setError('Acronym is required');
      return;
    }
    if (yearInvalid) {
      setError('Year must be between 1900 and 2100');
      return;
    }
    if (duplicate) {
      setError(`${trialLabel(duplicate)} already exists.`);
      return;
    }
    try {
      setSaving(true);
      setError('');
      const input = {
        acronym: name,
        full_name: fullName.trim() || null,
        year: parsedYear as number | null,
        population: text.population.trim() || null,
        intervention: text.intervention.trim() || null,
        comparator: text.comparator.trim() || null,
        result: text.result.trim() || null,
        notes: text.notes.trim() || null,
        superseded_by: supersededBy || null,
      };
      const links = topics.map(({ topic_id, section_id }) => ({ topic_id, section_id }));
      const saved = editing
        ? await updateTrial(trial!.id, input, topicsLoaded ? links : undefined)
        : await createTrial(input, links);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(trialErrorMessage(err, name));
    } finally {
      setSaving(false);
    }
  };

  if (confirmDelete && trial) {
    return (
      <Modal isOpen={isOpen} onClose={() => setConfirmDelete(false)} title="Delete Trial">
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          Delete {trialLabel(trial)}? It is removed from every topic that cites it, and links from notes to it are
          removed. Your notes are kept. This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            isLoading={saving}
            onClick={async () => {
              try {
                setSaving(true);
                await deleteTrial(trial.id);
                onClose();
                onDeleted?.();
              } catch (err) {
                setError(trialErrorMessage(err));
                setConfirmDelete(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Trial' : 'New Trial'} maxWidth="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Input
            label="Acronym"
            value={acronym}
            onChange={(e) => setAcronym(e.target.value)}
            placeholder="e.g. POINT"
            maxLength={60}
            required
          />
          <Input
            label="Year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2018"
            maxLength={4}
            error={yearInvalid ? '1900–2100' : undefined}
          />
        </div>
        {duplicate && (
          <p className="-mt-3 mb-4 text-xs text-amber-700 dark:text-amber-300" role="status">
            {trialLabel(duplicate)} already exists.{' '}
            <Link
              href={`/trials/${duplicate.id}`}
              onClick={onClose}
              className="underline text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Open it
            </Link>
          </p>
        )}

        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Platelet-Oriented Inhibition in New TIA and Minor Ischemic Stroke"
        />

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={`mb-4 ${f.key === 'result' || f.key === 'notes' || f.key === 'population' ? 'sm:col-span-2' : ''}`}>
              <label htmlFor={`trial-${f.key}`} className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                {f.label}
              </label>
              <textarea
                id={`trial-${f.key}`}
                value={text[f.key]}
                onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))}
                rows={f.key === 'notes' ? 3 : 2}
                placeholder={f.placeholder}
                className="input resize-y"
              />
            </div>
          ))}
        </div>

        <Select
          label="Superseded by"
          value={supersededBy}
          onChange={(e) => setSupersededBy(e.target.value)}
          options={[
            { value: '', label: 'Not superseded' },
            ...candidates.map((t) => ({ value: t.id, label: trialLabel(t) })),
          ]}
        />

        <NoteTopicPicker value={topics} onChange={setTopics} showPrimary={false} label="Cited under topics" />

        <div className="flex items-center justify-between gap-3">
          {editing ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Delete trial
            </button>
          ) : (
            <span />
          )}
          <div className="flex space-x-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving} disabled={!!duplicate || !topicsLoaded}>
              {editing ? 'Save' : 'Create Trial'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
