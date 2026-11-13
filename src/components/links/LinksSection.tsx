import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import NoteTypeIcon from '../notes/NoteTypeIcon';
import LinkPickerModal from './LinkPickerModal';
import { PlusIcon } from '../topics/icons';
import useTrials from '@/lib/hooks/useTrials';
import {
  LinkedNoteSummary,
  NoteLink,
  createLink,
  deleteLink,
  getLinksFor,
  getNoteSummaries,
  linkErrorMessage,
} from '@/lib/supabase/noteLinks';
import { Endpoint, draftKey, groupLinks } from '@/lib/utils/noteLinks';
import { trialLabel } from '@/lib/utils/trials';

interface LinksSectionProps {
  self: Endpoint;
  /** "This note" or the trial's label, for the picker's preview sentence. */
  selfLabel: string;
}

/**
 * Labeled links to and from a note or trial, in both directions:
 * "Answers …" / "Answered by …", "Cites …" / "Cited by …".
 */
export default function LinksSection({ self, selfLabel }: LinksSectionProps) {
  const { byId: trialsById } = useTrials();
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [notes, setNotes] = useState<Record<string, LinkedNoteSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getLinksFor(self.type, self.id);
      const noteIds = new Set<string>();
      for (const l of rows) {
        if (l.source_type === 'note') noteIds.add(l.source_id);
        if (l.target_type === 'note') noteIds.add(l.target_id);
      }
      noteIds.delete(self.id);
      setNotes(await getNoteSummaries([...noteIds]));
      setLinks(rows);
      setError('');
    } catch (err) {
      console.error('Error loading links:', err);
      setError("Couldn't load links right now.");
    } finally {
      setLoading(false);
    }
  }, [self.type, self.id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const groups = useMemo(() => groupLinks(self, links), [self, links]);
  const existing = useMemo(
    () =>
      new Set(
        links.filter((l) => l.source_type === self.type && l.source_id === self.id).map((l) => draftKey(l))
      ),
    [links, self]
  );

  const remove = async (id: string) => {
    const previous = links;
    setLinks((ls) => ls.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setLinks(previous);
      setError(linkErrorMessage(err));
    }
  };

  const describe = (other: Endpoint) => {
    if (other.type === 'trial') {
      const t = trialsById.get(other.id);
      return { href: `/trials/${other.id}`, title: t ? trialLabel(t) : 'Trial', type: 'trial', unanswered: false };
    }
    const n = notes[other.id];
    return {
      href: `/notes/${other.id}`,
      title: n?.title ?? 'Note',
      type: n?.content_type ?? null,
      unanswered: n?.status === 'unanswered',
    };
  };

  return (
    <section aria-labelledby="links-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="links-heading" className="text-lg font-medium">
          Links
        </h2>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <PlusIcon className="w-4 h-4" />
          Add link
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-4" role="status" aria-label="Loading links">
          <div className="w-6 h-6 border-4 rounded-full border-primary-500 border-t-transparent animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No links yet. Link related notes and trials, e.g. a note that answers a question or cites a trial.
        </p>
      ) : (
        <div className="p-4 space-y-4 bg-white rounded-lg shadow dark:bg-gray-800">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-1 text-sm font-semibold text-gray-700 md:text-sm dark:text-gray-300">{group.label}</h3>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {group.items.map(({ link, other, direction }) => {
                  const d = describe(other);
                  return (
                    <li key={link.id} className="flex items-center gap-3 py-2">
                      <span className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-md text-primary-700 bg-primary-50 dark:bg-primary-900/60 dark:text-primary-200">
                        <NoteTypeIcon type={d.type} />
                      </span>
                      <Link
                        href={d.href}
                        className="flex-1 min-w-0 font-medium text-gray-900 break-words hover:text-primary-700 focus:outline-none focus-visible:underline dark:text-gray-100 dark:hover:text-primary-300"
                      >
                        {d.title}
                      </Link>
                      {d.unanswered && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-amber-900 bg-amber-100 rounded dark:bg-amber-900/60 dark:text-amber-100">
                          Unanswered
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(link.id)}
                        aria-label={`Remove link: ${group.label.toLowerCase()} ${d.title}`}
                        title={direction === 'incoming' ? 'Remove this link (set on the other item)' : 'Remove link'}
                        className="p-1.5 text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <LinkPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        source={self}
        sourceLabel={selfLabel}
        existing={existing}
        onPick={async (draft) => {
          try {
            await createLink(self, { type: draft.target_type, id: draft.target_id }, draft.relation);
          } catch (err) {
            throw new Error(linkErrorMessage(err));
          }
          await load();
        }}
      />
    </section>
  );
}
