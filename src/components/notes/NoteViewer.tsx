import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import Button from '../ui/Button';
import CategoryBadge from '../ui/CategoryBadge';
import NoteEditor from './NoteEditor';

interface NoteViewerProps {
  note: Note;
}

export default function NoteViewer({ note }: NoteViewerProps) {
  const router = useRouter();
  const { removeNote } = useNotes();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Format the date (e.g., "May 2, 2025")
  const formattedDate = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await removeNote(note.id);
      router.push('/notes');
    } catch (err) {
      console.error('Error deleting note:', err);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold">{note.title}</h1>
          <div className="flex items-center mt-2 space-x-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formattedDate}
            </span>
            <CategoryBadge category={note.category} />
          </div>
        </div>
        
        <div className="flex space-x-3">
          <Link href={`/notes/${note.id}/edit`}>
            <Button variant="outline">
              Edit
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      </div>
      
      {/* Tags section */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {note.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {/* Note content */}
      <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
        <NoteEditor content={note.content} onChange={() => {}} editable={false} />
      </div>
      
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-medium">Delete Note</h3>
            <p className="mb-4 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                isLoading={isDeleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}