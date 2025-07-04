// src/components/notes/EnhancedFlashcardGeneratorModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import { FlashcardService } from '@/services/flashcard';
import { supabase } from '@/lib/supabase/client';
import type { FlashcardDeck, FlashcardType, Flashcard } from '@/types/flashcard';

interface EnhancedFlashcardGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
}

type Status = 'idle' | 'loading' | 'preview' | 'saved' | 'error';

// Store the last generated cards to ensure consistency between preview and save
let lastGeneratedCards: any[] = [];
let lastGenerationConfig: any = null;

export function EnhancedFlashcardGeneratorModal({
  isOpen,
  onClose,
  noteId,
  noteTitle
}: EnhancedFlashcardGeneratorModalProps) {
  // Configuration state
  const [status, setStatus] = useState<Status>('idle');
  const [cardType, setCardType] = useState<FlashcardType>('cloze');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [maxCards, setMaxCards] = useState(10);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  
  // Cards state
  const [previewCards, setPreviewCards] = useState<Flashcard[]>([]);
  const [savedFlashcards, setSavedFlashcards] = useState<Flashcard[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('generate');

  // Load decks on open
  useEffect(() => {
    if (isOpen) {
      loadDecks();
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setStatus('idle');
    setError('');
    setPreviewCards([]);
    setSavedFlashcards([]);
    setActiveTab('generate');
    setCardType('cloze');
    setMaxCards(10);
    lastGeneratedCards = [];
    lastGenerationConfig = null;
  };

  const loadDecks = async () => {
    try {
      const decksData = await FlashcardService.getDecks();
      setDecks(decksData);
      
      // Set default deck
      const defaultDeck = decksData.find(d => d.name === 'Default Deck') || decksData[0];
      if (defaultDeck) {
        setSelectedDeckId(defaultDeck.id);
      }
    } catch (error) {
      console.error('Failed to load decks:', error);
      setError('Failed to load decks. Please try again.');
    }
  };

  const generatePreview = useCallback(async () => {
    if (!selectedDeckId) {
      setError('Please select a deck');
      return;
    }

    try {
      setStatus('loading');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to generate flashcards');
      }

      const config = {
        note_id: noteId,
        card_type: cardType,
        deck_id: selectedDeckId,
        max_cards: maxCards
      };

      // Call the unified API with preview=true
      const response = await fetch('/api/flashcards/generate-from-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...config,
          preview: true // This tells the API to not save the cards
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const data = await response.json();
      
      // Store the generated cards and config for later use
      lastGeneratedCards = data.cards;
      lastGenerationConfig = config;
      
      // Convert the raw cards to display format
      const displayCards: Flashcard[] = data.cards.map((card: any, index: number) => ({
        id: `preview-${index}`,
        deck_id: selectedDeckId,
        note_id: noteId,
        user_id: 'preview',
        card_type: cardType,
        cloze_content: card.cloze,
        front_content: card.front,
        back_content: card.back,
        status: 'new' as const,
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        last_reviewed: undefined,
        next_review: new Date().toISOString(),
        total_reviews: 0,
        correct_reviews: 0,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      setPreviewCards(displayCards);
      setStatus('preview');
    } catch (err) {
      console.error('Error generating preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
      setStatus('error');
    }
  }, [noteId, cardType, selectedDeckId, maxCards]);

  const savePreviewFlashcards = async () => {
    if (!selectedDeckId) {
      setError('Please select a deck');
      return;
    }

    // Ensure we have preview cards to save
    if (lastGeneratedCards.length === 0 || !lastGenerationConfig) {
      setError('No preview cards to save. Please generate a preview first.');
      return;
    }

    try {
      setStatus('loading');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to save flashcards');
      }

      // Use the same config as the preview to ensure consistency
      const response = await fetch('/api/flashcards/generate-from-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...lastGenerationConfig,
          preview: false // This tells the API to save the cards
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save flashcards');
      }

      const data = await response.json();
      setSavedFlashcards(data.flashcards);
      setStatus('saved');
      setActiveTab('review');
    } catch (err) {
      console.error('Error saving flashcards:', err);
      setError(err instanceof Error ? err.message : 'Failed to save flashcards');
      setStatus('error');
    }
  };

  const generateAndSaveFlashcards = async () => {
    if (!selectedDeckId) {
      setError('Please select a deck');
      return;
    }

    try {
      setStatus('loading');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to generate flashcards');
      }

      // Call the unified API with preview=false to generate and save directly
      const response = await fetch('/api/flashcards/generate-from-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          note_id: noteId,
          card_type: cardType,
          deck_id: selectedDeckId,
          max_cards: maxCards,
          preview: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate flashcards');
      }

      const data = await response.json();
      setSavedFlashcards(data.flashcards);
      setStatus('saved');
      setActiveTab('review');
    } catch (err) {
      console.error('Error generating flashcards:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
      setStatus('error');
    }
  };

  const downloadForAnki = () => {
    const cards = status === 'saved' ? savedFlashcards : previewCards;
    if (cards.length === 0) return;

    const ankiText = cards.map(card => {
      if (card.cloze_content) {
        return card.cloze_content;
      } else if (card.front_content && card.back_content) {
        return `${card.front_content}\t${card.back_content}`;
      }
      return '';
    }).filter(Boolean).join('\n');

    const blob = new Blob([ankiText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_flashcards.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFlashcardPreview = (card: Flashcard, index: number) => (
    <div key={card.id || index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
      {card.cloze_content ? (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cloze Card:</p>
          <p className="text-gray-900 dark:text-gray-100">{card.cloze_content}</p>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Front:</p>
            <p className="text-gray-900 dark:text-gray-100">{card.front_content}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Back:</p>
            <p className="text-gray-900 dark:text-gray-100">{card.back_content}</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderConfigurationPanel = () => (
    <div className="space-y-6">
      {/* Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Select
          label="Card Type"
          value={cardType}
          onChange={(e) => setCardType(e.target.value as FlashcardType)}
          options={[
            { value: 'cloze', label: 'Cloze Deletion' },
            { value: 'front_back', label: 'Front & Back' }
          ]}
        />

        <Select
          label="Target Deck"
          value={selectedDeckId}
          onChange={(e) => setSelectedDeckId(e.target.value)}
          options={[
            { value: '', label: 'Select a deck...' },
            ...decks.map(deck => ({ value: deck.id, label: deck.name }))
          ]}
        />

        <Input
          label="Max Cards"
          type="number"
          min="1"
          max="50"
          value={maxCards}
          onChange={(e) => setMaxCards(parseInt(e.target.value) || 10)}
        />
      </div>

      {/* Card Type Info */}
      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
          {cardType === 'cloze' ? 'Cloze Deletion Cards' : 'Front & Back Cards'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {cardType === 'cloze' 
            ? 'Creates cards with hidden text using {{c1::word}} format for active recall.'
            : 'Creates traditional question and answer cards with separate front and back content.'
          }
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          onClick={generatePreview}
          disabled={status === 'loading' || !selectedDeckId}
          variant="outline"
        >
          {status === 'loading' && previewCards.length === 0 ? <Spinner size="sm" /> : null}
          Preview Cards
        </Button>
        
        <Button 
          onClick={generateAndSaveFlashcards}
          disabled={status === 'loading' || !selectedDeckId}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {status === 'loading' && savedFlashcards.length === 0 ? <Spinner size="sm" /> : null}
          Generate & Save
        </Button>
      </div>
    </div>
  );

  const renderPreviewSection = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Preview ({previewCards.length} cards)
        </h3>
        <div className="flex gap-2">
          <Button onClick={downloadForAnki} variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Preview
          </Button>
          <Button 
            onClick={savePreviewFlashcards} 
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? <Spinner size="sm" /> : 
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            }
            Save to Deck
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {previewCards.map((card, index) => renderFlashcardPreview(card, index))}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          💡 This is a preview. Click "Save to Deck" to create these exact flashcards in your deck.
        </p>
      </div>
    </div>
  );

  const renderLoadingState = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Spinner size="lg" />
      <p className="mt-4 text-gray-600 dark:text-gray-400">
        {status === 'loading' && previewCards.length === 0 ? 'Generating' : 'Saving'} {cardType} flashcards...
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
        This may take a few moments
      </p>
    </div>
  );

  const renderErrorState = () => (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <div className="flex items-center">
        <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button 
            onClick={() => setStatus('idle')} 
            variant="outline" 
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );

  const renderSuccessState = () => (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
      <div className="flex items-center">
        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-sm text-green-700 dark:text-green-400">
          Successfully generated and saved {savedFlashcards.length} flashcards!
        </p>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Enhanced Flashcard Generator
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            From note: <span className="font-medium">{noteTitle}</span>
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex px-6">
            <button
              onClick={() => setActiveTab('generate')}
              className={`py-3 px-4 text-sm font-medium border-b-2 ${
                activeTab === 'generate'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Generate
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`py-3 px-4 text-sm font-medium border-b-2 ${
                activeTab === 'review'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              disabled={savedFlashcards.length === 0}
            >
              Saved Cards ({savedFlashcards.length})
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-250px)]">
          {activeTab === 'generate' && (
            <div className="space-y-6">
              {status === 'idle' && renderConfigurationPanel()}
              {status === 'loading' && renderLoadingState()}
              {status === 'preview' && previewCards.length > 0 && renderPreviewSection()}
              {status === 'error' && renderErrorState()}
              {status === 'saved' && renderSuccessState()}
            </div>
          )}

          {activeTab === 'review' && (
            <div className="space-y-4">
              {savedFlashcards.length > 0 ? (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                      Saved Flashcards ({savedFlashcards.length})
                    </h3>
                    <Button onClick={downloadForAnki} variant="outline">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download for Anki
                    </Button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {savedFlashcards.map((card, index) => renderFlashcardPreview(card, index))}
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-sm text-green-700 dark:text-green-400">
                      ✅ These flashcards have been saved to your deck and are ready for study!
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    No flashcards saved yet.
                  </p>
                  <Button onClick={() => setActiveTab('generate')} variant="outline">
                    Go to Generate Tab
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {cardType === 'cloze' ? 'Cloze deletion format' : 'Front & back format'} • 
              {selectedDeckId ? ` Target: ${decks.find(d => d.id === selectedDeckId)?.name}` : ' No deck selected'}
            </div>
            <div className="flex gap-3">
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}