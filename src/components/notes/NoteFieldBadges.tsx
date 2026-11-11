import { Note } from '@/lib/supabase/client';
import { CONTENT_TYPE_LABELS, isContentType } from '@/lib/utils/noteFields';

interface NoteFieldBadgesProps {
  note: Pick<Note, 'status' | 'content_type'>;
  className?: string;
}

/**
 * Small labels for a note's content type and, when it is an open question,
 * an "Unanswered" badge. Renders nothing when neither applies.
 */
export default function NoteFieldBadges({ note, className = '' }: NoteFieldBadgesProps) {
  const type = isContentType(note.content_type) ? note.content_type : null;
  const unanswered = note.status === 'unanswered';

  if (!type && !unanswered) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {type && (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-300 rounded dark:text-gray-300 dark:border-gray-600">
          {CONTENT_TYPE_LABELS[type]}
        </span>
      )}
      {unanswered && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-900 bg-amber-100 rounded dark:bg-amber-900/60 dark:text-amber-100">
          <span aria-hidden="true" className="w-1.5 h-1.5 bg-amber-600 rounded-full dark:bg-amber-300" />
          Unanswered
        </span>
      )}
    </div>
  );
}
