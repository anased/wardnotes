import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
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
import { OUTGOING_LABELS, draftKey } from '@/lib/utils/noteLinks';
import { tagKey, tagsEqual } from '@/lib/utils/tagUtils';
import TopicSelect from '../topics/TopicSelect';
import TopicFormModal from '../topics/TopicFormModal';
import TagInput from '../ui/TagInput';
import NoteTypeIcon from './NoteTypeIcon';
import LinkPickerModal from '../links/LinkPickerModal';
import { LinkDraftWithTitle } from '../links/NoteLinksField';

interface NotePropertiesBarProps {
  /** Id of the note being edited; undefined for a new note. */
  noteId?: string;
  topics: NoteTopicLink[];
  onTopicsChange: (links: NoteTopicLink[]) => void;
  labels: string[];
  onLabelsChange: (labels: string[]) => void;
  labelSuggestions: string[];
  links: LinkDraftWithTitle[];
  onLinksChange: (links: LinkDraftWithTitle[]) => void;
}

/** Which popover is open: adding a topic or label, or editing one linked topic. */
type OpenPanel = { kind: 'add-topic' } | { kind: 'add-label' } | { kind: 'topic'; topicId: string } | null;

const chipBase =
  'inline-flex items-center h-8 gap-1.5 rounded-full text-sm font-medium max-w-full';
const addButtonClass =
  'inline-flex items-center h-8 gap-1.5 px-3 text-sm font-medium text-gray-600 bg-white border border-dashed border-gray-300 rounded-full hover:border-gray-400 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:text-gray-100';
const popoverClass =
  'absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] p-3 bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-gray-800 dark:border-gray-700';

function StarIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center justify-center w-6 h-6 -mr-1 rounded-full opacity-70 hover:opacity-100 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-white/10"
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

const TopicIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
const LabelIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinejoin="round" d="M20 12 12 20l-8-8V4h8z" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);
const LinkIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path strokeLinecap="round" d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);

/**
 * The note's properties (topics, labels, links) as one compact row of chips
 * under the title. Adding and editing happen in small popovers so the form
 * stays out of the way of writing.
 */
export default function NotePropertiesBar({
  noteId,
  topics,
  onTopicsChange,
  labels,
  onLabelsChange,
  labelSuggestions,
  links,
  onLinksChange,
}: NotePropertiesBarProps) {
  const { graph } = useTopics();
  const [open, setOpen] = useState<OpenPanel>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [sectionsByTopic, setSectionsByTopic] = useState<Record<string, TopicSection[]>>({});
  const [createName, setCreateName] = useState<string | null>(null);
  const createResolver = useRef<((id: string | null) => void) | null>(null);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const rootRef = useRef<HTMLDivElement>(null);
  const radioName = useId();

  // Close the open popover on a click outside the bar
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // Load the sections of each linked topic once
  const topicKey = topics.map((l) => l.topic_id).join(',');
  useEffect(() => {
    const missing = topics.map((l) => l.topic_id).filter((id) => !(id in sectionsByTopic));
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

  const handleCreateTopic = (name: string) =>
    new Promise<string | null>((resolve) => {
      createResolver.current = resolve;
      setCreateName(name);
    });

  const finishCreate = (id: string | null) => {
    createResolver.current?.(id);
    createResolver.current = null;
    setCreateName(null);
  };

  const removeTopic = (topicId: string) => {
    onTopicsChange(withTopicIds(topics, topics.filter((l) => l.topic_id !== topicId).map((l) => l.topic_id)));
    setOpen(null);
  };

  const toggle = (panel: NonNullable<OpenPanel>) =>
    setOpen((current) => (JSON.stringify(current) === JSON.stringify(panel) ? null : panel));

  // Escape closes the popover (nested comboboxes stop it while their list is open)
  const handlePopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(null);
    }
  };

  const popover = (labelText: string, children: ReactNode) => (
    <div role="dialog" aria-label={labelText} className={popoverClass} onKeyDown={handlePopoverKeyDown}>
      {children}
    </div>
  );

  const rows = sortForDisplay(topics);

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      {/* Topics */}
      {rows.map((link) => {
        const name = graph.byId.get(link.topic_id)?.name ?? 'Unknown topic';
        const sections = sectionsByTopic[link.topic_id] ?? [];
        const section = sections.find((s) => s.id === link.section_id);
        const path = pathLabel(link.topic_id);
        const isOpen = open?.kind === 'topic' && open.topicId === link.topic_id;
        return (
          <span key={link.topic_id} className="relative max-w-full">
            <span
              className={`${chipBase} pl-3 pr-2 text-primary-800 bg-primary-50 dark:bg-primary-900/50 dark:text-primary-100`}
            >
              <button
                type="button"
                onClick={() => toggle({ kind: 'topic', topicId: link.topic_id })}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                title={path ? `${path} › ${name}` : name}
                className="inline-flex items-center min-w-0 gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {link.is_primary && (
                  <span role="img" aria-label="Primary topic">
                    <StarIcon />
                  </span>
                )}
                <span className="truncate">{name}</span>
                {section && <span className="font-normal truncate opacity-75">› {section.name}</span>}
              </button>
              <RemoveButton label={`Remove topic ${name}`} onClick={() => removeTopic(link.topic_id)} />
            </span>

            {isOpen &&
              popover(
                `Topic ${name}`,
                <div className="space-y-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    {path && <p className="text-xs text-gray-500 truncate dark:text-gray-400">{path}</p>}
                  </div>
                  <div>
                    <label
                      htmlFor={`${radioName}-section-${link.topic_id}`}
                      className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      Section
                    </label>
                    <select
                      id={`${radioName}-section-${link.topic_id}`}
                      value={link.section_id ?? ''}
                      onChange={(e) => onTopicsChange(withSection(topics, link.topic_id, e.target.value || null))}
                      className="input w-full py-1.5 text-sm"
                      disabled={sections.length === 0}
                    >
                      <option value="">{sections.length === 0 ? 'No sections' : 'Unsorted'}</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {link.is_primary ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <StarIcon className="w-3 h-3" /> Primary topic
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTopicsChange(withPrimary(topics, link.topic_id))}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        <StarIcon className="w-3.5 h-3.5" /> Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTopic(link.topic_id)}
                      className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
          </span>
        );
      })}

      <span className="relative">
        <button
          type="button"
          onClick={() => toggle({ kind: 'add-topic' })}
          aria-expanded={open?.kind === 'add-topic'}
          aria-haspopup="dialog"
          className={addButtonClass}
        >
          <TopicIcon />
          Topic
        </button>
        {open?.kind === 'add-topic' &&
          popover(
            'Add topic',
            <>
              <TopicSelect
                label="Add topic"
                value={topics.map((l) => l.topic_id)}
                onChange={(ids) => onTopicsChange(withTopicIds(topicsRef.current, ids))}
                onCreate={handleCreateTopic}
                hideChips
                autoFocus
                placeholder="Search topics or synonyms (e.g. RPLS)…"
              />
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                A note can be filed under several topics. The first one you add becomes its primary topic (★).
              </p>
            </>
          )}
      </span>

      {/* Labels */}
      {labels.map((label) => (
        <span
          key={tagKey(label)}
          className={`${chipBase} pl-3 pr-2 text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-200`}
        >
          <span className="truncate">#{label}</span>
          <RemoveButton
            label={`Remove label ${label}`}
            onClick={() => onLabelsChange(labels.filter((t) => !tagsEqual(t, label)))}
          />
        </span>
      ))}

      <span className="relative">
        <button
          type="button"
          onClick={() => toggle({ kind: 'add-label' })}
          aria-expanded={open?.kind === 'add-label'}
          aria-haspopup="dialog"
          className={addButtonClass}
        >
          <LabelIcon />
          Label
        </button>
        {open?.kind === 'add-label' &&
          popover(
            'Add label',
            <TagInput
              label="Add label"
              value={labels}
              onChange={onLabelsChange}
              suggestions={labelSuggestions}
              hideChips
              autoFocus
              placeholder="Type a label, press Enter"
            />
          )}
      </span>

      {/* Links to other notes and trials */}
      {links.map((l) => (
        <span
          key={draftKey(l)}
          className={`${chipBase} pl-3 pr-2 text-gray-700 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200`}
        >
          <NoteTypeIcon type={l.target_type === 'trial' ? 'trial' : null} className="w-3.5 h-3.5 shrink-0" decorative />
          <span className="truncate">
            {OUTGOING_LABELS[l.relation]} {l.title}
          </span>
          <RemoveButton
            label={`Remove link: ${OUTGOING_LABELS[l.relation].toLowerCase()} ${l.title}`}
            onClick={() => onLinksChange(links.filter((x) => draftKey(x) !== draftKey(l)))}
          />
        </span>
      ))}

      <button
        type="button"
        onClick={() => {
          setOpen(null);
          setShowLinkPicker(true);
        }}
        className={addButtonClass}
      >
        <LinkIcon />
        {/* Not "Add link": the editor toolbar already has a hyperlink button with that name */}
        Link note or trial
      </button>

      <LinkPickerModal
        isOpen={showLinkPicker}
        onClose={() => setShowLinkPicker(false)}
        source={{ type: 'note', id: noteId ?? 'new-note' }}
        sourceLabel="This note"
        existing={new Set(links.map(draftKey))}
        onPick={(draft, title) => onLinksChange([...links, { ...draft, title }])}
      />

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
