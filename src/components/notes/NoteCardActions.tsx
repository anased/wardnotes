import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import CardActionsMenu from '../ui/CardActionsMenu';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';

/** Edit / Delete menu for a NoteCard, with its delete confirmation. */
export default function NoteCardActions({ note }: { note: Note }) {
  const router = useRouter();
  const { removeNote } = useNotes();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <CardActionsMenu
        itemLabel={note.title}
        onEdit={() => router.push(`/notes/${note.id}/edit`)}
        onDelete={() => setConfirmDelete(true)}
      />
      <ConfirmDeleteModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Note"
        onConfirm={() => removeNote(note.id)}
      >
        Delete <span className="font-medium text-gray-900 dark:text-gray-100">“{note.title}”</span>? This action cannot be
        undone.
      </ConfirmDeleteModal>
    </>
  );
}
