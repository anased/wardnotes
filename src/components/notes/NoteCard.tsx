import Link from 'next/link';
import { Note } from '@/lib/supabase/client';
import CategoryBadge from '../ui/CategoryBadge';

interface NoteCardProps {
  note: Note;
}

export default function NoteCard({ note }: NoteCardProps) {
  // Format the date (e.g., "May 2, 2025")
  const formattedDate = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

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
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}