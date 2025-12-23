// src/components/flashcards/CustomStudySessionModal.tsx
import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import TagInput from '@/components/ui/TagInput';
import { FlashcardService } from '@/services/flashcard';
import type { Flashcard, FlashcardDeck } from '@/types/flashcard';

interface CustomStudySessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSession: (cards: Flashcard[]) => void;
  decks: FlashcardDeck[];
}

export function CustomStudySessionModal({
  isOpen,
  onClose,
  onStartSession,
  decks
}: CustomStudySessionModalProps) {
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dueOnly, setDueOnly] = useState<boolean>(true);
  const [matchingCount, setMatchingCount] = useState<number>(0);
  const [isLoadingCount, setIsLoadingCount] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [flashcardTags, setFlashcardTags] = useState<string[]>([]);

  // Fetch available tags on mount
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const tags = await FlashcardService.getFlashcardTags();
        setFlashcardTags(tags);
      } catch (err) {
        console.error('Failed to fetch flashcard tags:', err);
      }
    };

    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  // Update count when filters change (with debounce)
  useEffect(() => {
    if (!selectedDeckId) {
      setMatchingCount(0);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingCount(true);
        setError('');
        const count = await FlashcardService.getCustomStudyCount(
          selectedDeckId,
          selectedTags.length > 0 ? selectedTags : undefined,
          dueOnly
        );
        setMatchingCount(count);
      } catch (err) {
        console.error('Failed to get count:', err);
        setError('Failed to load card count');
      } finally {
        setIsLoadingCount(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [selectedDeckId, selectedTags, dueOnly]);

  const handleStartSession = async () => {
    if (!selectedDeckId) {
      setError('Please select a deck');
      return;
    }

    if (matchingCount === 0) {
      setError('No flashcards match your criteria');
      return;
    }

    try {
      setIsStarting(true);
      setError('');
      const cards = await FlashcardService.getCustomStudyCards(
        selectedDeckId,
        selectedTags.length > 0 ? selectedTags : undefined,
        dueOnly
      );

      if (cards.length === 0) {
        setError('No cards available. They may have been modified.');
        return;
      }

      onStartSession(cards);
      handleClose();
    } catch (err) {
      console.error('Failed to load flashcards:', err);
      setError('Failed to load flashcards. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setSelectedDeckId('');
    setSelectedTags([]);
    setDueOnly(true);
    setMatchingCount(0);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Create Custom Study Session
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Deck Selector */}
          <div>
            <label htmlFor="deck-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Study Deck <span className="text-red-500">*</span>
            </label>
            {decks.length === 0 ? (
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400">
                  No decks available. Create a deck first to start studying.
                </p>
              </div>
            ) : (
              <select
                id="deck-select"
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="">Select a deck</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tag Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filter by Tags (optional)
            </label>
            <TagInput
              value={selectedTags}
              onChange={setSelectedTags}
              suggestions={flashcardTags}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Select multiple tags to find flashcards with any of these tags
            </p>
          </div>

          {/* Due Only Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dueOnly}
                onChange={(e) => setDueOnly(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Only show cards due for review
              </span>
            </label>
            <p className="ml-6 mt-1 text-xs text-gray-500 dark:text-gray-400">
              Uncheck to include all flashcards, not just due ones
            </p>
          </div>

          {/* Card Count Display */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            {isLoadingCount ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Counting cards...</span>
              </div>
            ) : selectedDeckId ? (
              <div>
                <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                  {matchingCount} flashcard{matchingCount !== 1 ? 's' : ''} found
                </p>
                {matchingCount > 50 && (
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                    Note: Sessions are limited to 50 cards. The 50 most due cards will be selected.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a deck to see matching flashcards
              </p>
            )}
          </div>

          {/* Error Messages */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Suggestions */}
          {selectedDeckId && matchingCount === 0 && !isLoadingCount && (
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">
                No flashcards match your criteria. Try:
              </p>
              <ul className="text-sm text-orange-600 dark:text-orange-400 list-disc list-inside space-y-1">
                {selectedTags.length > 0 && <li>Removing some tags</li>}
                {dueOnly && <li>Unchecking "Only show cards due for review"</li>}
                <li>Selecting a different deck</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartSession}
            disabled={!selectedDeckId || matchingCount === 0 || isStarting || decks.length === 0}
            isLoading={isStarting}
          >
            {isStarting ? 'Loading cards...' : 'Start Study Session'}
          </Button>
        </div>
      </div>
    </div>
  );
}
