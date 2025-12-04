// src/components/flashcards/StudySession.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Button from '@/components/ui/Button';
import { FlashcardView } from './FlashcardView';
import { FlashcardService } from '@/services/flashcard';
import { splitClozeCard, extractClozeNumbers } from '@/lib/utils/clozeUtils';
import type { Flashcard, FlashcardDeck, ReviewQuality, StudySessionStats } from '@/types/flashcard';

interface StudySessionProps {
  deck?: FlashcardDeck; // Now optional to support note-based study
  noteId?: string; // NEW - for note-based study
  noteTitle?: string; // NEW - for display
  onSessionComplete: (stats: StudySessionStats) => void;
  onSessionPause: () => void;
}

interface StudyCard {
  flashcard: Flashcard;
  clozeNumber?: number; // For cloze cards, which specific cloze to test
  totalClozes?: number;  // Total number of clozes in the original card
}

export function StudySession({ deck, noteId, noteTitle, onSessionComplete, onSessionPause }: StudySessionProps) {
  const [studyCards, setStudyCards] = useState<StudyCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [reviewStats, setReviewStats] = useState({ correct: 0, total: 0 });

  // Convert flashcards to study cards (splitting multi-cloze cards)
  const createStudyCards = useCallback((flashcards: Flashcard[]): StudyCard[] => {
    const studyCards: StudyCard[] = [];
    
    for (const flashcard of flashcards) {
      if (flashcard.card_type === 'cloze' && flashcard.cloze_content) {
        // Split multi-cloze cards into individual cloze tests
        const clozeNumbers = extractClozeNumbers(flashcard.cloze_content);
        
        if (clozeNumbers.length > 1) {
          // Multiple clozes - create separate study cards for each
          for (const clozeNumber of clozeNumbers) {
            studyCards.push({
              flashcard,
              clozeNumber,
              totalClozes: clozeNumbers.length
            });
          }
        } else {
          // Single cloze or no clozes
          studyCards.push({
            flashcard,
            clozeNumber: clozeNumbers[0] || 1,
            totalClozes: 1
          });
        }
      } else {
        // Front/back card
        studyCards.push({ flashcard });
      }
    }
    
    return studyCards;
  }, []);

  // Initialize study session
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setIsLoading(true);
        
        // Start the session
        const session = await FlashcardService.startStudySession(deck?.id, 'review');
        setSessionId(session.id);

        // Get cards due for review
        const flashcards = await FlashcardService.getFlashcardsDue(deck?.id, noteId);
        
        // Convert to study cards and shuffle
        const studyCards = createStudyCards(flashcards);
        const shuffledCards = [...studyCards].sort(() => Math.random() - 0.5);
        
        setStudyCards(shuffledCards);
        
        if (shuffledCards.length === 0) {
          // No cards to study
          await FlashcardService.endStudySession(session.id);
          const stats = await FlashcardService.getStudySessionStats(session.id);
          onSessionComplete(stats);
        }
      } catch (error) {
        console.error('Failed to initialize study session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [deck?.id, noteId, onSessionComplete, createStudyCards]);

  const currentStudyCard = useMemo(() => {
    return studyCards[currentIndex] || null;
  }, [studyCards, currentIndex]);

  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
  }, []);

  const handleSubmitReview = useCallback(async (quality: ReviewQuality) => {
    if (!currentStudyCard || !sessionId) return;

    try {
      setIsLoading(true);
      
      // Submit review for the flashcard
      await FlashcardService.submitReviewById(currentStudyCard.flashcard.id, quality);
      
      // Update stats
      const newStats = {
        correct: reviewStats.correct + (quality >= 3 ? 1 : 0),
        total: reviewStats.total + 1
      };
      setReviewStats(newStats);

      // Update session
      await FlashcardService.updateStudySession(sessionId, {
        cards_studied: newStats.total,
        cards_correct: newStats.correct,
        total_time: Math.round((Date.now() - startTime) / 1000)
      });

      // Move to next card
      if (currentIndex < studyCards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false);
      } else {
        // Session complete
        await FlashcardService.endStudySession(sessionId);
        const finalStats = await FlashcardService.getStudySessionStats(sessionId);
        onSessionComplete(finalStats);
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentStudyCard, sessionId, currentIndex, studyCards.length, reviewStats, startTime, onSessionComplete]);

  const handlePauseSession = useCallback(async () => {
    if (sessionId) {
      try {
        await FlashcardService.updateStudySession(sessionId, {
          cards_studied: reviewStats.total,
          cards_correct: reviewStats.correct,
          total_time: Math.round((Date.now() - startTime) / 1000)
        });
      } catch (error) {
        console.error('Failed to update session on pause:', error);
      }
    }
    onSessionPause();
  }, [sessionId, reviewStats, startTime, onSessionPause]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (showAnswer) {
        switch (event.key) {
          case '1':
            handleSubmitReview(0);
            break;
          case '2':
            handleSubmitReview(1);
            break;
          case '3':
            handleSubmitReview(3);
            break;
          case '4':
            handleSubmitReview(4);
            break;
        }
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        handleShowAnswer();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showAnswer, handleSubmitReview, handleShowAnswer]);

  if (isLoading && !currentStudyCard) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading study session...</p>
        </div>
      </div>
    );
  }

  if (!currentStudyCard) {
    return (
      <div className="card w-full max-w-2xl mx-auto p-6 text-center">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          No cards due for review!
        </p>
        <Button onClick={onSessionPause}>
          Return to Deck
        </Button>
      </div>
    );
  }

  const progress = Math.round(((currentIndex + 1) / studyCards.length) * 100);

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Study Session{noteTitle ? ` - ${noteTitle}` : deck ? ` - ${deck.name}` : ''}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Card {currentIndex + 1} of {studyCards.length}
              {currentStudyCard.totalClozes && currentStudyCard.totalClozes > 1 && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  (Cloze {currentStudyCard.clozeNumber} of {currentStudyCard.totalClozes})
                </span>
              )}
            </p>
          </div>
          <Button
            onClick={handlePauseSession}
            variant="outline"
          >
            Pause Session
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        {/* Stats */}
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mt-2">
          <span>{reviewStats.correct} correct</span>
          <span>{progress}% complete</span>
          <span>{reviewStats.total > 0 ? Math.round((reviewStats.correct / reviewStats.total) * 100) : 0}% accuracy</span>
        </div>
      </div>

      {/* Flashcard */}
      <FlashcardView
        flashcard={currentStudyCard.flashcard}
        showAnswer={showAnswer}
        onShowAnswer={handleShowAnswer}
        onSubmitReview={handleSubmitReview}
        isLoading={isLoading}
        clozeNumber={currentStudyCard.clozeNumber}
      />
    </div>
  );
}