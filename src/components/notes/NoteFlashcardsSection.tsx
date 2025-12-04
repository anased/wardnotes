// src/components/notes/NoteFlashcardsSection.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { FlashcardService } from '@/services/flashcard';
import { StudySession } from '@/components/flashcards/StudySession';
import { FlashcardListView } from '@/components/flashcards/FlashcardListView';
import Button from '@/components/ui/Button';
import type { Flashcard, FlashcardType, FlashcardStatus, StudySessionStats } from '@/types/flashcard';

interface NoteFlashcardsSectionProps {
  noteId: string;
  noteTitle: string;
}

interface FlashcardStats {
  total: number;
  due: number;
  new: number;
  learning: number;
}

export default function NoteFlashcardsSection({ noteId, noteTitle }: NoteFlashcardsSectionProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FlashcardStats>({ total: 0, due: 0, new: 0, learning: 0 });
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);

  // Fetch flashcards for this note
  const loadFlashcards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cards = await FlashcardService.getFlashcards({ note_id: noteId });
      setFlashcards(cards);

      // Calculate stats
      const now = new Date();
      const newStats: FlashcardStats = {
        total: cards.length,
        due: cards.filter(card =>
          new Date(card.next_review) <= now && card.status !== 'suspended'
        ).length,
        new: cards.filter(card => card.status === 'new').length,
        learning: cards.filter(card => card.status === 'learning').length
      };
      setStats(newStats);
    } catch (err) {
      console.error('Failed to load flashcards:', err);
      setError('Failed to load flashcards');
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadFlashcards();
  }, [loadFlashcards]);

  const handleStudyComplete = (stats: StudySessionStats) => {
    setShowStudyModal(false);
    loadFlashcards(); // Refresh cards after study
  };

  const handleStudyPause = () => {
    setShowStudyModal(false);
    loadFlashcards(); // Refresh cards after pause
  };

  const handleFlashcardUpdated = () => {
    loadFlashcards(); // Refresh cards after edit/delete
  };

  const getStatusColor = (status: FlashcardStatus): string => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'learning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'review': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'mature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'suspended': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getCardTypeIcon = (cardType: FlashcardType) => {
    if (cardType === 'cloze') {
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0a2 2 0 01-2-2v-4a2 2 0 00-2-2H8z" />
      </svg>
    );
  };

  const truncateText = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Loading state
  if (loading) {
    return (
      <div className="mt-6 p-6 bg-white rounded-lg shadow dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mt-6 p-6 bg-white rounded-lg shadow dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center text-red-600 dark:text-red-400">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (flashcards.length === 0) {
    return (
      <div className="mt-6 p-6 bg-white rounded-lg shadow dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="text-center py-8">
          <svg className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No flashcards generated yet
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Use the AI Flashcard Generator to create flashcards from this note
          </p>
        </div>
      </div>
    );
  }

  // Content state - horizontal/compact layout
  return (
    <div className="mt-6 p-6 bg-white rounded-lg shadow dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Flashcards from this note
        </h3>
        <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium">
          {stats.total} {stats.total === 1 ? 'card' : 'cards'}
        </span>
      </div>

      {/* Stats Row - Horizontal 3-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Due Cards */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-700 dark:text-blue-300">Due</span>
            <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.due}</span>
          </div>
        </div>

        {/* New Cards */}
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 dark:text-green-300">New</span>
            <span className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.new}</span>
          </div>
        </div>

        {/* Learning Cards */}
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-yellow-700 dark:text-yellow-300">Learning</span>
            <span className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.learning}</span>
          </div>
        </div>
      </div>

      {/* Card Preview Row - Horizontal scrollable */}
      <div className="mb-4 relative">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
          {flashcards.slice(0, 10).map((card) => (
            <button
              key={card.id}
              onClick={() => setShowListModal(true)}
              className="flex-shrink-0 w-56 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer text-left"
            >
              {/* Card type and status badges */}
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {getCardTypeIcon(card.card_type)}
                  <span className="ml-1">{card.card_type === 'cloze' ? 'Cloze' : 'Front/Back'}</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(card.status)}`}>
                  {card.status}
                </span>
              </div>

              {/* Card content preview */}
              <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                {card.card_type === 'cloze'
                  ? truncateText(card.cloze_content || '', 80)
                  : truncateText(card.front_content || '', 80)}
              </div>
            </button>
          ))}
        </div>

        {/* Gradient fade indicator for more cards */}
        {flashcards.length > 10 && (
          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-white dark:from-gray-800 to-transparent pointer-events-none"></div>
        )}
      </div>

      {/* More cards indicator */}
      {flashcards.length > 10 && (
        <div className="text-center mb-4">
          <button
            onClick={() => setShowListModal(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            +{flashcards.length - 10} more {flashcards.length - 10 === 1 ? 'card' : 'cards'}
          </button>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => setShowStudyModal(true)}
          disabled={stats.due === 0}
          className="flex-1"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Study Due Cards ({stats.due})
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowListModal(true)}
          className="flex-1"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          View All Cards
        </Button>
      </div>

      {/* Study Modal */}
      {showStudyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
            <StudySession
              noteId={noteId}
              noteTitle={noteTitle}
              onSessionComplete={handleStudyComplete}
              onSessionPause={handleStudyPause}
            />
          </div>
        </div>
      )}

      {/* Flashcard List Modal */}
      <FlashcardListView
        noteId={noteId}
        noteTitle={noteTitle}
        isOpen={showListModal}
        onClose={() => setShowListModal(false)}
        onFlashcardUpdated={handleFlashcardUpdated}
      />
    </div>
  );
}
