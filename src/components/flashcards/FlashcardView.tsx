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
  clozeNumber?: number; // Add this prop to specify which cloze to hide
}

export function FlashcardView({ 
  flashcard, 
  showAnswer, 
  onShowAnswer, 
  onSubmitReview, 
  isLoading = false,
  clozeNumber = 1 // Default to first cloze
}: FlashcardViewProps) {
  
  const renderClozeCard = () => {
    if (!flashcard.cloze_content) return null;
    
    if (showAnswer) {
      // Show with all answers filled in
      const withAnswers = flashcard.cloze_content.replace(
        /\{\{c(\d+)::(.*?)(?:::.*?)?\}\}/g, 
        '<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded font-semibold">$2</span>'
      );
      
      return (
        <div 
          className="text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: withAnswers }} 
        />
      );
    } else {
      // Show with only the specific cloze number hidden
      let processedContent = flashcard.cloze_content;
      
      // First, fill in all OTHER cloze deletions (not the current one being tested)
      processedContent = processedContent.replace(
        /\{\{c(\d+)::(.*?)(?:::.*?)?\}\}/g, 
        (match, clozeNum, content) => {
          if (parseInt(clozeNum) === clozeNumber) {
            // This is the cloze being tested - keep it as placeholder for now
            return match;
          } else {
            // This is a different cloze - show the answer
            return `<span class="text-blue-600 dark:text-blue-400 font-medium">${content}</span>`;
          }
        }
      );
      
      // Now replace the specific cloze being tested with a blank
      processedContent = processedContent.replace(
        new RegExp(`\\{\\{c${clozeNumber}::(.*?)(?:::.*?)?\\}\\}`, 'g'),
        '<span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded font-mono">[...]</span>'
      );
      
      return (
        <div 
          className="text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: processedContent }} 
        />
      );
    }
  };

  const renderFrontBackCard = () => {
    return (
      <div className="text-lg leading-relaxed">
        {showAnswer ? (
          <div>
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Question:</div>
              {flashcard.front_content}
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
              <div className="text-sm text-blue-600 dark:text-blue-400 mb-2">Answer:</div>
              {flashcard.back_content}
            </div>
          </div>
        ) : (
          flashcard.front_content
        )}
      </div>
    );
  };

  return (
    <div className="card w-full max-w-2xl mx-auto">
      <div className="p-6 min-h-[300px] flex flex-col">
        {/* Card Content */}
        <div className="flex-1 flex items-center justify-center mb-6">
          <div className="w-full text-center">
            {flashcard.card_type === 'cloze' ? renderClozeCard() : renderFrontBackCard()}
          </div>
        </div>

        {/* Card Info */}
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center">
          {flashcard.card_type === 'cloze' && (
            <div className="mb-2">
              Testing cloze #{clozeNumber}
            </div>
          )}
          <div className="flex justify-center space-x-4">
            <span>Reviews: {flashcard.total_reviews}</span>
            <span>Accuracy: {flashcard.total_reviews > 0 ? Math.round((flashcard.correct_reviews / flashcard.total_reviews) * 100) : 0}%</span>
            <span>Ease: {flashcard.ease_factor.toFixed(1)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center space-y-4">
          {!showAnswer ? (
            <Button
              onClick={onShowAnswer}
              disabled={isLoading}
              className="w-full max-w-xs"
            >
              Show Answer
            </Button>
          ) : (
            <div className="w-full space-y-3">
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center mb-3">
                How well did you know this?
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button
                  onClick={() => onSubmitReview(0)}
                  disabled={isLoading}
                  variant="outline"
                  className="text-red-600 hover:bg-red-50 border-red-200 hover:border-red-300"
                >
                  Again
                </Button>
                <Button
                  onClick={() => onSubmitReview(1)}
                  disabled={isLoading}
                  variant="outline"
                  className="text-orange-600 hover:bg-orange-50 border-orange-200 hover:border-orange-300"
                >
                  Hard
                </Button>
                <Button
                  onClick={() => onSubmitReview(3)}
                  disabled={isLoading}
                  variant="outline"
                  className="text-green-600 hover:bg-green-50 border-green-200 hover:border-green-300"
                >
                  Good
                </Button>
                <Button
                  onClick={() => onSubmitReview(4)}
                  disabled={isLoading}
                  variant="outline"
                  className="text-blue-600 hover:bg-blue-50 border-blue-200 hover:border-blue-300"
                >
                  Easy
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Help */}
        {!showAnswer ? (
          <div className="text-xs text-gray-400 text-center mt-4">
            Press Space or Enter to show answer
          </div>
        ) : (
          <div className="text-xs text-gray-400 text-center mt-4">
            Press 1-4 for rating or use buttons above
          </div>
        )}
      </div>
    </div>
  );
}