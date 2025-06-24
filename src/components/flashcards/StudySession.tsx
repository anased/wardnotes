// src/components/flashcards/StudySession.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { FlashcardView } from './FlashcardView';
import { FlashcardService } from '@/services/flashcard';
import type { Flashcard, FlashcardDeck, ReviewQuality, StudySessionStats } from '@/types/flashcard';

interface StudySessionProps {
  deck: FlashcardDeck;
  onSessionComplete: (stats: StudySessionStats) => void;
  onSessionPause: () => void;
}

export function StudySession({ deck, onSessionComplete, onSessionPause }: StudySessionProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState({ correct: 0, total: 0 });
  const [startTime] = useState(Date.now());

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  // Load cards and start session
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setIsLoading(true);
        
        // Start study session
        const session = await FlashcardService.startStudySession(deck.id, 'review');
        setSessionId(session.id);
        
        // Get due cards
        const dueCards = await FlashcardService.getDueCards(deck.id, 20); // Limit to 20 cards per session
        setCards(dueCards);
        
        if (dueCards.length === 0) {
          onSessionComplete({
            totalCards: 0,
            correctCards: 0,
            accuracy: 0,
            averageTime: 0,
            newCards: 0,
            reviewCards: 0,
            learningCards: 0
          });
        }
      } catch (error) {
        console.error('Failed to initialize study session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [deck.id, onSessionComplete]);

  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
  }, []);

  const handleSubmitReview = useCallback(async (quality: ReviewQuality) => {
    if (!currentCard || !sessionId) return;

    try {
      setIsLoading(true);
      
      // Submit the review
      await FlashcardService.submitReview({
        flashcard_id: currentCard.id,
        quality,
        response_time: Date.now() - startTime
      });

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
      if (currentIndex < cards.length - 1) {
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
  }, [currentCard, sessionId, currentIndex, cards.length, reviewStats, startTime, onSessionComplete]);

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
            handleSubmitReview(2);
            break;
          case '4':
            handleSubmitReview(3);
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

  if (isLoading && !currentCard) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading study session...</p>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="card w-full max-w-2xl mx-auto p-6 text-center">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          No cards due for review!
        </p>
        <Button onClick={onSessionPause}>Return to Deck</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Session Header */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={handlePauseSession}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
            <span className="font-medium">{deck.name}</span>
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
            <span>{currentIndex + 1} / {cards.length}</span>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>{reviewStats.total > 0 ? Math.round((reviewStats.correct / reviewStats.total) * 100) : 0}%</span>
            </div>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Flashcard */}
      <FlashcardView
        flashcard={currentCard}
        showAnswer={showAnswer}
        onShowAnswer={handleShowAnswer}
        onSubmitReview={handleSubmitReview}
        isLoading={isLoading}
      />

      {/* Keyboard Shortcuts Help */}
      <div className="card p-3 bg-gray-50 dark:bg-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
          {!showAnswer ? (
            <span>Press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Space</kbd> or <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Enter</kbd> to show answer</span>
          ) : (
            <span>Press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">1</kbd>-<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">4</kbd> to rate your performance</span>
          )}
        </div>
      </div>
    </div>
  );
}