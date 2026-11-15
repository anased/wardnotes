import { useState } from 'react';
import NoteTypeIcon from '../notes/NoteTypeIcon';
import LinkPickerModal from './LinkPickerModal';
import { PlusIcon } from '../topics/icons';
import { LinkDraft, OUTGOING_LABELS, draftKey } from '@/lib/utils/noteLinks';

export interface LinkDraftWithTitle extends LinkDraft {
  /** Title of the target, for display. */
  title: string;
}

interface NoteLinksFieldProps {
  /** Id of the note being edited (excluded from targets); undefined for a new note. */
  noteId?: string;
  value: LinkDraftWithTitle[];
  onChange: (links: LinkDraftWithTitle[]) => void;
}

/** Outgoing links from the note being edited; saved together with the note. */
export default function NoteLinksField({ noteId, value, onChange }: NoteLinksFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span id="note-links-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Links
        </span>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <PlusIcon className="w-4 h-4" />
          {/* Not "Add link": the editor toolbar already has a hyperlink button with that name */}
          Link a note or trial
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Link this note to other notes or trials: it answers, supports, cites, critiques or illustrates them.
        </p>
      ) : (
        <ul
          aria-labelledby="note-links-label"
          className="border border-gray-200 divide-y divide-gray-200 rounded-lg dark:border-gray-700 dark:divide-gray-700"
        >
          {value.map((l) => (
            <li key={draftKey(l)} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-shrink-0 text-xs font-medium text-gray-600 w-20 dark:text-gray-400">
                {OUTGOING_LABELS[l.relation]}
              </span>
              <span className="flex-shrink-0 text-primary-700 dark:text-primary-300">
                <NoteTypeIcon type={l.target_type === 'trial' ? 'trial' : null} />
              </span>
              <span className="flex-1 min-w-0 text-sm truncate">{l.title}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => draftKey(x) !== draftKey(l)))}
                aria-label={`Remove link: ${OUTGOING_LABELS[l.relation].toLowerCase()} ${l.title}`}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <LinkPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        source={{ type: 'note', id: noteId ?? 'new-note' }}
        sourceLabel="This note"
        existing={new Set(value.map(draftKey))}
        onPick={(draft, title) => onChange([...value, { ...draft, title }])}
      />
    </div>
  );
}
