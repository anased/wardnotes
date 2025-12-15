import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import { EnhancedFlashcardGeneratorModal } from './EnhancedFlashcardGeneratorModal';
import PremiumFeatureGate from '@/components/premium/PremiumFeatureGate';
import InlineQuotaIndicator from '@/components/premium/InlineQuotaIndicator';
import { useQuota } from '@/lib/hooks/useQuota';
import { useSubscription } from '@/lib/hooks/useSubscription';

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
  const { refreshQuota } = useQuota();
  const { isPremium: isUserPremium } = useSubscription();

  const handleClick = () => {
    // PremiumFeatureGate handles quota checking, so just open the modal
    setIsModalOpen(true);
  };

  return (
    <>
      <PremiumFeatureGate
        featureName="AI Flashcard Generation"
        description="Generate flashcards from your notes using AI"
        featureType="flashcard_generation"
      >
        <Button onClick={handleClick} variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate Flashcards
          {!isUserPremium && (
            <InlineQuotaIndicator featureType="flashcard_generation" />
          )}
        </Button>
      </PremiumFeatureGate>

      <EnhancedFlashcardGeneratorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        noteId={noteId}
        noteTitle={noteTitle}
        onSuccess={refreshQuota}
      />
    </>
  );
}
