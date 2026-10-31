import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import CategoryBadge from '../ui/CategoryBadge';

interface NoteCardProps {
  note: Note;
  /** Called when a tag is clicked. Without it, clicking a tag opens the notes page filtered by that tag. */
  onTagClick?: (tag: string) => void;
}

export default function NoteCard({ note, onTagClick }: NoteCardProps) {
  const router = useRouter();

  // Format the date (e.g., "May 2, 2025")
  const formattedDate = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Handle tag click
  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.preventDefault(); // Prevent navigating to the note
    e.stopPropagation(); // Stop event propagation

    if (onTagClick) {
      onTagClick(tag);
    } else {
      router.push(`/notes?tag=${encodeURIComponent(tag)}`);
    }
  };

  return (
    <Link href={`/notes/${note.id}`} className="block">
      <div className="card p-4 transition hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">{note.title}</h3>
          <CategoryBadge category={note.category} size="sm" />
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {formattedDate}
        </div>
        
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {note.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-label={`Show notes tagged ${tag}`}
                className="tag hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
                onClick={(e) => handleTagClick(e, tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}