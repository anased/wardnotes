import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import { EnhancedFlashcardGeneratorModal } from './EnhancedFlashcardGeneratorModal';
import PremiumFeatureGate from '@/components/premium/PremiumFeatureGate';

interface FlashcardIntegrationButtonProps {
  noteId: string;
  noteTitle: string;
  isPremium?: boolean;
}

export function FlashcardIntegrationButton({ 
  noteId, 
  noteTitle, 
  isPremium = false 
}: FlashcardIntegrationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  const handleClick = () => {
    if (!isPremium) {
      setShowPremiumGate(true);
      return;
    }
    setIsModalOpen(true);
  };

  if (!isPremium && showPremiumGate) {
    return (
      <PremiumFeatureGate
        featureName="Enhanced Flashcard System"
        description="Generate and study flashcards with integrated spaced repetition"
      >
        <Button onClick={handleClick} variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Study Cards
        </Button>
      </PremiumFeatureGate>
    );
  }

  return (
    <>
      <Button onClick={handleClick} variant="outline">
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Generate Flashcards
      </Button>

      <EnhancedFlashcardGeneratorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        noteId={noteId}
        noteTitle={noteTitle}
      />
    </>
  );
}
