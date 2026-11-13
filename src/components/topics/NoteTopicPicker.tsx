import { useEffect, useId, useRef, useState } from 'react';
import useTopics from '@/lib/hooks/useTopics';
import { TopicSection, getTopicSections } from '@/lib/supabase/topicSections';
import {
  NoteTopicLink,
  sortForDisplay,
  withPrimary,
  withSection,
  withTopicIds,
} from '@/lib/utils/noteTopicLinks';
import { ancestorPaths } from '@/lib/utils/topicTree';
import TopicSelect from './TopicSelect';
import TopicFormModal from './TopicFormModal';

interface NoteTopicPickerProps {
  value: NoteTopicLink[];
  onChange: (links: NoteTopicLink[]) => void;
}

/**
 * Links a note to topics: search by name or alias (creating a topic only
 * when nothing matches), pick the primary topic, and optionally a section
 * within each linked topic.
 */
export default function NoteTopicPicker({ value, onChange }: NoteTopicPickerProps) {
  const { graph } = useTopics();
  const [sectionsByTopic, setSectionsByTopic] = useState<Record<string, TopicSection[]>>({});
  const [createName, setCreateName] = useState<string | null>(null);
  const createResolver = useRef<((id: string | null) => void) | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const hintId = useId();
  const radioName = useId();

  // Load the sections of each linked topic once
  const topicKey = value.map((l) => l.topic_id).join(',');
  useEffect(() => {
    const missing = value.map((l) => l.topic_id).filter((id) => !(id in sectionsByTopic));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => getTopicSections(id).then((s) => [id, s] as const)))
      .then((entries) => {
        if (!cancelled) setSectionsByTopic((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      })
      .catch((err) => console.error('Error loading sections:', err));
    return () => {
      cancelled = true;
    };
  }, [topicKey]);

  const pathLabel = (id: string) => {
    const [path] = ancestorPaths(graph, id, 1);
    return (path ?? []).slice(0, -1).map((p) => graph.byId.get(p)?.name).join(' › ');
  };

  const handleCreate = (name: string) =>
    new Promise<string | null>((resolve) => {
      createResolver.current = resolve;
      setCreateName(name);
    });

  const finishCreate = (id: string | null) => {
    createResolver.current?.(id);
    createResolver.current = null;
    setCreateName(null);
  };

  const rows = sortForDisplay(value);

  return (
    <div className="mb-4">
      <TopicSelect
        label="Topics"
        value={value.map((l) => l.topic_id)}
        onChange={(ids) => onChange(withTopicIds(valueRef.current, ids))}
        onCreate={handleCreate}
        hideChips
        describedBy={hintId}
        placeholder={value.length === 0 ? 'Search topics or synonyms (e.g. RPLS)…' : 'Add another topic…'}
      />

      {rows.length === 0 ? (
        <p id={hintId} className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
          A note can be filed under several topics. The first one you add becomes its primary topic.
        </p>
      ) : (
        <ul
          id={hintId}
          aria-label="Linked topics"
          className="-mt-2 border border-gray-200 divide-y divide-gray-200 rounded-lg dark:border-gray-700 dark:divide-gray-700"
        >
          {rows.map((link) => {
            const topic = graph.byId.get(link.topic_id);
            const name = topic?.name ?? 'Unknown topic';
            const sections = sectionsByTopic[link.topic_id] ?? [];
            const path = pathLabel(link.topic_id);
            return (
              <li key={link.topic_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <label className="flex items-center flex-1 min-w-[12rem] gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={radioName}
                    checked={link.is_primary}
                    onChange={() => onChange(withPrimary(value, link.topic_id))}
                    className="w-4 h-4 accent-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    aria-label={`Make ${name} the primary topic`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {name}
                      {link.is_primary && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs font-medium text-primary-800 bg-primary-50 rounded ring-1 ring-primary-200 dark:bg-primary-900/60 dark:text-primary-100 dark:ring-primary-700">
                          Primary
                        </span>
                      )}
                    </span>
                    {path && <span className="block text-xs text-gray-500 truncate dark:text-gray-400">{path}</span>}
                  </span>
                </label>

                <label className="sr-only" htmlFor={`${radioName}-section-${link.topic_id}`}>
                  Section in {name}
                </label>
                <select
                  id={`${radioName}-section-${link.topic_id}`}
                  value={link.section_id ?? ''}
                  onChange={(e) => onChange(withSection(value, link.topic_id, e.target.value || null))}
                  className="input w-auto py-1 text-sm"
                  disabled={sections.length === 0}
                  title={sections.length === 0 ? `${name} has no sections yet` : undefined}
                >
                  <option value="">{sections.length === 0 ? 'No sections' : 'Unsorted'}</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onChange(withTopicIds(value, value.filter((l) => l.topic_id !== link.topic_id).map((l) => l.topic_id)))}
                  aria-label={`Remove topic ${name}`}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <TopicFormModal
        isOpen={createName !== null}
        defaultName={createName ?? ''}
        onClose={() => finishCreate(null)}
        onSaved={(topic) => {
          // onClose runs right after onSaved; resolve with the new id first
          createResolver.current?.(topic.id);
          createResolver.current = null;
        }}
      />
    </div>
  );
}
