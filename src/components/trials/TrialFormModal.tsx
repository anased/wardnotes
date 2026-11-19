import { useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '@/lib/supabase/client';
import { detectTrialQuery } from '@/lib/trials/identify';
import type { TrialCandidate } from '@/lib/trials/rankCandidates';

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

/** Response of POST /api/trials/extract. */
interface ExtractResponse {
  trial: {
    is_clinical_trial: boolean;
    acronym: string | null;
    full_name: string | null;
    year: number | null;
  } & Record<TextKey, string | null>;
  source: { pmid: string; title: string; journal: string | null; year: number | null; url: string } | null;
}

/** Response of POST /api/trials/search (subset used here). */
interface SearchResponse {
  query: string;
  candidates: TrialCandidate[];
  ambiguous: boolean;
  notice: string | null;
}

/** Candidates shown to the user. */
const SHOWN_CANDIDATES = 3;

interface ExtractSummary {
  filled: string[];
  skipped: string[];
  source: ExtractResponse['source'];
  notTrial: boolean;
  missingAcronym: boolean;
}

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
  const [sourceInput, setSourceInput] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractSummary, setExtractSummary] = useState<ExtractSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const sourceRef = useRef<HTMLInputElement>(null);
  const detected = useMemo(() => detectTrialQuery(sourceInput), [sourceInput]);
  const isSearch = detected?.kind === 'name' || detected?.kind === 'nct';
  const busy = extracting || searching;

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
    setSourceInput('');
    setExtractError('');
    setExtractSummary(null);
    setSearchResult(null);
    setManualEntry(false);
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

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('You must be logged in to use this');
    return `Bearer ${session.access_token}`;
  };

  /** Look up a trial by name/acronym or NCT number (PubMed + ClinicalTrials.gov; no AI). */
  const handleSearch = async () => {
    if (!sourceInput.trim() || busy) return;
    setSearching(true);
    setExtractError('');
    setExtractSummary(null);
    setSearchResult(null);
    try {
      const response = await fetch('/api/trials/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
        body: JSON.stringify({ query: sourceInput }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Trial search failed. Please try again.');
      setSearchResult(data as SearchResponse);
    } catch (err) {
      setExtractError(
        err instanceof TypeError
          ? 'Network error: check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'Trial search failed'
      );
    } finally {
      setSearching(false);
    }
  };

  const pickCandidate = (c: TrialCandidate) => {
    setSearchResult(null);
    setSourceInput(c.pmid);
    handleExtract(c.pmid);
  };

  const enterManually = () => {
    setSearchResult(null);
    setSourceInput('');
    setManualEntry(true);
    sourceRef.current?.focus();
  };

  const handleSourceSubmit = () => (isSearch ? handleSearch() : handleExtract());

  /** Fill empty fields from an abstract (PMID / DOI / link / pasted text). Never overwrites user input. */
  const handleExtract = async (sourceText: string = sourceInput) => {
    if (!sourceText.trim() || busy) return;
    setExtracting(true);
    setExtractError('');
    setExtractSummary(null);
    try {
      const response = await fetch('/api/trials/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
        body: JSON.stringify({ source: sourceText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) {
          setExtractError(data.message || 'Monthly AI limit reached. Upgrade to Premium for unlimited access.');
          return;
        }
        throw new Error(data.error || 'Failed to extract trial details');
      }

      const { trial: extracted, source } = data as ExtractResponse;
      const filled: string[] = [];
      const skipped: string[] = [];
      const fill = (label: string, current: string, value: string | null | undefined, set: (v: string) => void) => {
        const v = value?.trim();
        if (!v) return;
        if (current.trim()) {
          if (current.trim() !== v) skipped.push(label);
          return;
        }
        set(v);
        filled.push(label);
      };

      fill('Acronym', acronym, extracted.acronym, setAcronym);
      fill('Full name', fullName, extracted.full_name, setFullName);
      fill('Year', year, extracted.year ? String(extracted.year) : null, setYear);
      const sourceLine = source ? `Source: PubMed ${source.pmid}` : null;
      const notes = [extracted.notes?.trim(), sourceLine].filter(Boolean).join('\n\n') || null;
      for (const f of FIELDS) {
        const value = f.key === 'notes' ? notes : extracted[f.key];
        fill(f.label, text[f.key], value, (v) => setText((t) => ({ ...t, [f.key]: v })));
      }

      setExtractSummary({
        filled,
        skipped,
        source,
        notTrial: !extracted.is_clinical_trial,
        missingAcronym: !extracted.acronym && !acronym.trim(),
      });
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract trial details');
    } finally {
      setExtracting(false);
    }
  };

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

        <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <label htmlFor="trial-source" className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Fill from a trial <span className="font-normal text-gray-500 dark:text-gray-400">(AI)</span>
          </label>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {manualEntry
              ? 'Enter the PMID, DOI, or PubMed/journal link, or paste the abstract.'
              : 'Type a trial name (e.g. CHANCE-2) or NCT number, or enter a PMID, DOI, or link, or paste the abstract.'}{' '}
            Only empty fields are filled — check the result against the paper.
          </p>
          <div className="flex gap-2">
            <input
              id="trial-source"
              ref={sourceRef}
              value={sourceInput}
              onChange={(e) => {
                setSourceInput(e.target.value);
                if (searchResult) setSearchResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // don't submit the trial form
                  handleSourceSubmit();
                }
              }}
              placeholder={manualEntry ? 'e.g. 29766750 or 10.1056/NEJMoa1800410' : 'e.g. POINT, NCT00991029, or 29766750'}
              className="input flex-1 min-w-0"
              disabled={busy}
              enterKeyHint={isSearch ? 'search' : 'go'}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSourceSubmit}
              isLoading={busy}
              disabled={!sourceInput.trim() || busy}
            >
              {isSearch ? 'Search' : 'Extract'}
            </Button>
          </div>
          {searchResult && (
            <div className="mt-3" role="region" aria-label="Matching trial publications">
              {searchResult.notice && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                  {searchResult.notice}
                </p>
              )}
              {searchResult.candidates.length > 0 && (
                <>
                  <p className="mb-1 text-xs text-gray-600 dark:text-gray-300">
                    Pick the paper to fill from:
                  </p>
                  <ul className="space-y-2">
                    {searchResult.candidates.slice(0, SHOWN_CANDIDATES).map((c) => (
                      <li key={c.pmid}>
                        <button
                          type="button"
                          onClick={() => pickCandidate(c)}
                          className="w-full min-h-[44px] p-2 text-left bg-white border border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
                        >
                          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                            {c.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {c.isRct && (
                              <span className="px-1.5 py-0.5 font-semibold text-green-800 bg-green-100 rounded dark:bg-green-900 dark:text-green-200">
                                RCT
                              </span>
                            )}
                            <span>
                              {[c.journalAbbrev ?? c.journal, c.year, c.firstAuthor ? `${c.firstAuthor} et al.` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            <span className="text-gray-400">PMID {c.pmid}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                onClick={enterManually}
                className="mt-2 text-xs underline text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
              >
                None of these: enter PMID/DOI
              </button>
            </div>
          )}
          {extractError && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">
              {extractError}
            </p>
          )}
          {extractSummary && (
            <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300" role="status">
              {extractSummary.source && (
                <p>
                  From{' '}
                  <a
                    href={extractSummary.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {extractSummary.source.title}
                  </a>
                  {extractSummary.source.journal ? ` — ${extractSummary.source.journal}` : ''}
                  {extractSummary.source.year ? ` (${extractSummary.source.year})` : ''}
                </p>
              )}
              <p>
                {extractSummary.filled.length > 0
                  ? `Filled: ${extractSummary.filled.join(', ')}.`
                  : 'No empty fields to fill.'}
                {extractSummary.skipped.length > 0 &&
                  ` Kept your entries for: ${extractSummary.skipped.join(', ')}.`}
              </p>
              {extractSummary.missingAcronym && (
                <p className="text-amber-700 dark:text-amber-300">No acronym found in the abstract — please enter one.</p>
              )}
              {extractSummary.notTrial && (
                <p className="text-amber-700 dark:text-amber-300">
                  This doesn&apos;t look like a clinical trial report — double-check the source.
                </p>
              )}
            </div>
          )}
        </div>

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
