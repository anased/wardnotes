// src/components/flashcards/FlashcardView.tsx
import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import type { Flashcard, ReviewQuality } from '@/types/flashcard';

interface FlashcardViewProps {
  flashcard: Flashcard;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onSubmitReview: (quality: ReviewQuality) => void;
  isLoading?: boolean;
}

export function FlashcardView({ 
  flashcard, 
  showAnswer, 
  onShowAnswer, 
  onSubmitReview, 
  isLoading = false 
}: FlashcardViewProps) {
  const renderClozeCard = () => {
    if (!flashcard.cloze_content) return null;
    
    if (showAnswer) {
      // Show with answers filled in
      const withAnswers = flashcard.cloze_content.replace(
        /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, 
        '<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded font-semibold">$1</span>'
      );
      
      return (
        <div 
          className="text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: withAnswers }} 
        />
      );
    } else {
      // Show with blanks
      const withBlanks = flashcard.cloze_content.replace(
        /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, 
        '<span class="bg-gray-200 dark:bg-gray-700 text-transparent px-1 rounded">___</span>'
      );
      
      return (
        <div 
          className="text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: withBlanks }} 
        />
      );
    }
  };

  const renderFrontBackCard = () => {
    return (
      <div className="text-lg leading-relaxed">
        {showAnswer ? (
          <div>
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Question:</div>
              <div>{flashcard.front_content}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Answer:</div>
              <div className="text-blue-600 dark:text-blue-400 font-medium">
                {flashcard.back_content}
              </div>
            </div>
          </div>
        ) : (
          <div>{flashcard.front_content}</div>
        )}
      </div>
    );
  };

  const reviewButtons = [
    { quality: 0 as ReviewQuality, label: 'Again', color: 'bg-red-500 hover:bg-red-600 text-white', shortcut: '1' },
    { quality: 1 as ReviewQuality, label: 'Hard', color: 'bg-orange-500 hover:bg-orange-600 text-white', shortcut: '2' },
    { quality: 2 as ReviewQuality, label: 'Good', color: 'bg-yellow-500 hover:bg-yellow-600 text-white', shortcut: '3' },
    { quality: 3 as ReviewQuality, label: 'Easy', color: 'bg-green-500 hover:bg-green-600 text-white', shortcut: '4' },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="card p-6">
        {/* Card Type Indicator */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {flashcard.card_type === 'cloze' ? 'Cloze Deletion' : 'Front & Back'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Due: {new Date(flashcard.next_review).toLocaleDateString()}
          </span>
        </div>

        {/* Card Content */}
        <div className="min-h-[200px] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-6">
          {flashcard.card_type === 'cloze' ? renderClozeCard() : renderFrontBackCard()}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-4">
          {!showAnswer ? (
            <Button 
              onClick={onShowAnswer}
              disabled={isLoading}
              fullWidth
              className="py-3 text-lg"
            >
              Show Answer
            </Button>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {reviewButtons.map((button) => (
                <button
                  key={button.quality}
                  onClick={() => onSubmitReview(button.quality)}
                  disabled={isLoading}
                  className={`${button.color} py-2 px-3 text-sm font-medium relative rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 disabled:opacity-50`}
                >
                  {button.label}
                  <span className="absolute top-0 right-0 bg-black bg-opacity-20 text-xs px-1 rounded-bl">
                    {button.shortcut}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Card Info */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Reviews: {flashcard.total_reviews}</span>
            <span>Accuracy: {flashcard.total_reviews > 0 ? Math.round((flashcard.correct_reviews / flashcard.total_reviews) * 100) : 0}%</span>
            <span>Ease: {flashcard.ease_factor}</span>
            <span>Interval: {flashcard.interval_days}d</span>
          </div>
        </div>
      </div>
    </div>
  );
}