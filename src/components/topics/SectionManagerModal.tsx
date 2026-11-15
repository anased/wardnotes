import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  SECTION_SUGGESTIONS,
  TopicSection,
  createSection,
  deleteSection,
  renameSection,
  reorderSections,
  sectionErrorMessage,
} from '@/lib/supabase/topicSections';
import { moveItem, unusedSuggestions } from '@/lib/utils/topicSections';
import { normalizeTopicName } from '@/lib/utils/topicTree';
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from './icons';

interface SectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicName: string;
  sections: TopicSection[];
  /** Notes (and trials) filed under each section id. */
  itemCounts: Record<string, number>;
  /** Reload sections after a change. */
  onChanged: () => Promise<void> | void;
}

const iconButton =
  'p-1.5 text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100';

/**
 * Add, rename, reorder and delete a topic's sections. Sections belong to the
 * topic; a new topic starts with none. Deleting a section moves its notes to
 * "Unsorted".
 */
export default function SectionManagerModal({
  isOpen,
  onClose,
  topicId,
  topicName,
  sections,
  itemCounts,
  onChanged,
}: SectionManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNewName('');
    setRenamingId(null);
    setDeletingId(null);
    setError('');
  }, [isOpen]);

  const run = async (action: () => Promise<unknown>, name?: string) => {
    try {
      setBusy(true);
      setError('');
      await action();
      await onChanged();
      return true;
    } catch (err) {
      setError(sectionErrorMessage(err, name));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const nextOrder = sections.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;

  const add = async (raw: string) => {
    const name = normalizeTopicName(raw);
    if (!name) return;
    if (sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setError(`This topic already has a section called "${name}".`);
      return;
    }
    if (await run(() => createSection(topicId, name, nextOrder), name)) {
      setNewName('');
      addInputRef.current?.focus();
    }
  };

  const saveRename = async (section: TopicSection) => {
    const name = normalizeTopicName(renameValue);
    if (!name || name === section.name) {
      setRenamingId(null);
      return;
    }
    if (await run(() => renameSection(section.id, name), name)) setRenamingId(null);
  };

  const move = (index: number, delta: -1 | 1) =>
    run(() => reorderSections(topicId, moveItem(sections, index, delta).map((s) => s.id)));

  const suggestions = unusedSuggestions(SECTION_SUGGESTIONS, sections);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sections in ${topicName}`} maxWidth="max-w-lg">
      <div className="space-y-5">
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        {sections.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No sections yet. Notes on this topic are listed under &ldquo;Unsorted&rdquo; until you add sections and
            move them in.
          </p>
        ) : (
          <ul className="border border-gray-200 divide-y divide-gray-200 rounded-lg dark:border-gray-700 dark:divide-gray-700">
            {sections.map((section, index) => {
              const count = itemCounts[section.id] ?? 0;
              return (
                <li key={section.id} className="px-3 py-2">
                  {deletingId === section.id ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Delete &ldquo;{section.name}&rdquo;?
                        {count > 0 && ` Its ${count} ${count === 1 ? 'item moves' : 'items move'} to Unsorted.`}
                      </span>
                      <span className="flex gap-2">
                        <Button variant="outline" className="px-3 py-1 text-sm" onClick={() => setDeletingId(null)} disabled={busy}>
                          Cancel
                        </Button>
                        <Button
                          className="px-3 py-1 text-sm"
                          isLoading={busy}
                          onClick={async () => {
                            if (await run(() => deleteSection(section.id))) setDeletingId(null);
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </div>
                  ) : renamingId === section.id ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveRename(section);
                      }}
                    >
                      <label htmlFor={`rename-${section.id}`} className="sr-only">
                        Section name
                      </label>
                      <input
                        id={`rename-${section.id}`}
                        className="input py-1"
                        value={renameValue}
                        maxLength={80}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setRenamingId(null);
                          }
                        }}
                      />
                      <Button type="submit" className="px-3 py-1 text-sm" isLoading={busy}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">{section.name}</span>
                      <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                        {count} {count === 1 ? 'item' : 'items'}
                      </span>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(index, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${section.name} up`}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(index, 1)}
                        disabled={busy || index === sections.length - 1}
                        aria-label={`Move ${section.name} down`}
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => {
                          setRenamingId(section.id);
                          setRenameValue(section.name);
                        }}
                        disabled={busy}
                        aria-label={`Rename ${section.name}`}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className={`${iconButton} hover:text-red-600 dark:hover:text-red-400`}
                        onClick={() => setDeletingId(section.id)}
                        disabled={busy}
                        aria-label={`Delete ${section.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(newName);
            }}
          >
            <div className="flex-1">
              <label htmlFor="new-section-name" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Add section
              </label>
              <input
                id="new-section-name"
                ref={addInputRef}
                className="input"
                value={newName}
                maxLength={80}
                placeholder="Type a name or pick one below"
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || !normalizeTopicName(newName)}>
              Add
            </Button>
          </form>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3" aria-label="Suggested sections">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  disabled={busy}
                  className="px-2.5 py-1 text-xs text-gray-700 rounded-full bg-gray-50 ring-1 ring-gray-200 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:opacity-50 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
