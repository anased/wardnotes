// src/components/notes/NoteViewer.tsx - Updated
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import { useSubscription } from '@/lib/hooks/useSubscription'; // Add this import

import Button from '../ui/Button';
import CategoryBadge from '../ui/CategoryBadge';
import NoteEditor from './NoteEditor';
import FlashcardGeneratorModal from './FlashcardGeneratorModal';
import PremiumFeatureGate from '../premium/PremiumFeatureGate'; // Import the premium gate
import { FlashcardIntegrationButton } from './FlashcardIntegrationButton';

interface NoteViewerProps {
  note: Note;
}

export default function NoteViewer({ note }: NoteViewerProps) {
  const router = useRouter();
  const { isPremium } = useSubscription();
  const { removeNote } = useNotes();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);

  // Format the date (e.g., "May 2, 2025")
  const formattedDate = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const handleEdit = () => {
    router.push(`/notes/${note.id}/edit`); // Add this function
  };

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
          {/* Enhanced Flashcard Integration Button */}
          <FlashcardIntegrationButton 
            noteId={note.id}
            noteTitle={note.title}
            isPremium={isPremium} // Use isPremium from subscription hook
          />

          {/* Original Flashcard Generator (for backward compatibility) */}
          <PremiumFeatureGate
            featureName="AI Flashcard Generator (Legacy)"
            description="Generate Anki-compatible flashcards from this note (legacy export)."
          >
            <Button 
              variant="outline"
              onClick={() => setShowFlashcardModal(true)}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Anki Export
            </Button>
          </PremiumFeatureGate>
          <Button variant="outline" onClick={handleEdit}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
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
      
      {/* Flashcard Generator Modal - only shown for premium users */}
      {showFlashcardModal && (
        <FlashcardGeneratorModal
          isOpen={showFlashcardModal}
          onClose={() => setShowFlashcardModal(false)}
          noteId={note.id}
          noteTitle={note.title}
        />
      )}
    </div>
  );
}