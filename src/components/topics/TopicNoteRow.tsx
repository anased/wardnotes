import Link from 'next/link';
import { Note } from '@/lib/supabase/client';
import NoteTypeIcon from '../notes/NoteTypeIcon';
import MoveToSectionMenu from './MoveToSectionMenu';

interface TopicNoteRowProps {
  note: Note;
  sections: { id: string; name: string }[];
  sectionId: string | null;
  /** This topic is the note's primary topic. */
  isPrimary: boolean;
  /** Name and id of the note's primary topic when it is another topic. */
  primaryElsewhere?: { id: string; name: string } | null;
  onMove: (sectionId: string | null) => void;
  moving?: boolean;
}

/** One note in a topic section: type icon, title, status and date. */
export default function TopicNoteRow({
  note,
  sections,
  sectionId,
  isPrimary,
  primaryElsewhere,
  onMove,
  moving,
}: TopicNoteRowProps) {
  const unanswered = note.status === 'unanswered';
  const date = new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <li className="relative flex items-start gap-3 px-2 py-2 -mx-2 rounded-md group hover:bg-gray-50 focus-within:bg-gray-50 dark:hover:bg-gray-700/40 dark:focus-within:bg-gray-700/40">
      <span
        className={`flex items-center justify-center flex-shrink-0 mt-0.5 rounded-md w-7 h-7 ${
          unanswered
            ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/60 dark:text-amber-200'
            : 'text-primary-700 bg-primary-50 dark:bg-primary-900/60 dark:text-primary-200'
        }`}
      >
        <NoteTypeIcon type={note.content_type} />
      </span>

      <div className="flex-1 min-w-0">
        <Link
          href={`/notes/${note.id}`}
          className="font-medium text-gray-900 break-words hover:text-primary-700 focus:outline-none focus-visible:underline dark:text-gray-100 dark:hover:text-primary-300"
        >
          {note.title}
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-gray-600 dark:text-gray-400">
          <time dateTime={note.created_at}>{date}</time>
          {unanswered && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-medium text-amber-900 bg-amber-100 rounded dark:bg-amber-900/60 dark:text-amber-100">
              <span aria-hidden="true" className="w-1.5 h-1.5 bg-amber-600 rounded-full dark:bg-amber-300" />
              Unanswered
            </span>
          )}
          {isPrimary ? (
            <span className="px-1.5 py-0.5 font-medium text-primary-800 bg-primary-50 rounded ring-1 ring-primary-200 dark:bg-primary-900/60 dark:text-primary-100 dark:ring-primary-700">
              Primary topic
            </span>
          ) : (
            primaryElsewhere && (
              <span>
                Primary:{' '}
                <Link
                  href={`/topics/${primaryElsewhere.id}`}
                  className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {primaryElsewhere.name}
                </Link>
              </span>
            )
          )}
        </p>
      </div>

      <MoveToSectionMenu
        itemLabel={note.title}
        sections={sections}
        currentSectionId={sectionId}
        onMove={onMove}
        disabled={moving}
      />
    </li>
  );
}
