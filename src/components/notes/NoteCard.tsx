import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import { hasTag, splitVisibleTags } from '@/lib/utils/tagUtils';
import CategoryBadge from '../ui/CategoryBadge';
import NoteFieldBadges from './NoteFieldBadges';

/** Tags shown on a card before collapsing the rest into "+N". */
const MAX_VISIBLE_TAGS = 3;

interface NoteCardProps {
  note: Note;
  /** Called when a tag is clicked. Without it, clicking a tag opens the notes page filtered by that tag. */
  onTagClick?: (tag: string) => void;
  /** Tags to emphasise, e.g. the ones this note shares with the note being viewed. */
  highlightTags?: string[];
}

/**
 * Compact note summary for grids.
 *
 * The title is the link; a stretched pseudo-element makes the whole card
 * clickable while tag buttons stay separately clickable and focusable
 * (interactive elements can't be nested inside a link).
 */
export default function NoteCard({ note, onTagClick, highlightTags = [] }: NoteCardProps) {
  const router = useRouter();
  const unanswered = note.status === 'unanswered';
  const { visible, hidden } = splitVisibleTags(note.tags, MAX_VISIBLE_TAGS, highlightTags);

  const formattedDate = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    } else {
      router.push(`/notes?tag=${encodeURIComponent(tag)}`);
    }
  };

  return (
    <article
      className={`relative flex flex-col h-full p-4 bg-white border rounded-lg shadow-sm transition
        hover:shadow-md focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2
        dark:bg-gray-800 dark:focus-within:ring-primary-400 dark:focus-within:ring-offset-gray-900
        ${
          unanswered
            ? 'border-dashed border-amber-500 dark:border-amber-500'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
        }`}
    >
      {/* Header: category, type, status — kept out of the title's flow */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2 min-w-0">
        <CategoryBadge category={note.category} size="sm" variant="subtle" />
        <NoteFieldBadges note={note} inline />
      </div>

      <h3
        className="text-base font-semibold leading-snug text-gray-900 break-words line-clamp-3 dark:text-gray-100"
        title={note.title}
      >
        <Link
          href={`/notes/${note.id}`}
          className="focus:outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {note.title}
        </Link>
      </h3>

      {/* Footer pinned to the bottom so cards in a row line up */}
      <div className="pt-3 mt-auto">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <time dateTime={note.created_at}>{formattedDate}</time>
        </p>

        {visible.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {visible.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-label={`Show notes tagged ${tag}`}
                onClick={(e) => handleTagClick(e, tag)}
                className={`relative z-10 max-w-[10rem] truncate px-2 py-0.5 text-xs rounded-full transition
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
                  ${
                    hasTag(highlightTags, tag)
                      ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-200 hover:bg-primary-100 dark:bg-primary-900/60 dark:text-primary-100 dark:ring-primary-700'
                      : 'bg-gray-50 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
                  }`}
              >
                {tag}
              </button>
            ))}
            {hidden.length > 0 && (
              <span
                className="px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-400"
                title={hidden.join(', ')}
              >
                <span aria-hidden="true">+{hidden.length}</span>
                <span className="sr-only">
                  {`and ${hidden.length} more ${hidden.length === 1 ? 'tag' : 'tags'}: ${hidden.join(', ')}`}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
