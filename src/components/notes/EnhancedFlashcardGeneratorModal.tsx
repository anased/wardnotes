// src/components/notes/EnhancedFlashcardGeneratorModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
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

type Status = 'idle' | 'loading' | 'preview' | 'error' | 'saved';

export function EnhancedFlashcardGeneratorModal({
  isOpen,
  onClose,
  noteId,
  noteTitle
}: EnhancedFlashcardGeneratorModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [cardType, setCardType] = useState<FlashcardType>('cloze');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [maxCards, setMaxCards] = useState(10);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [previewCards, setPreviewCards] = useState<Flashcard[]>([]);
  const [generatedCards, setGeneratedCards] = useState<Flashcard[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('generate');

  // Load decks on open
  useEffect(() => {
    if (isOpen) {
      loadDecks();
      setStatus('idle');
      setError('');
      setPreviewCards([]);
      setGeneratedCards([]);
      setActiveTab('generate');
    }
  }, [isOpen]);

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
    }
  };

  // Generate preview using the existing API
  const generatePreview = useCallback(async () => {
    try {
      setStatus('loading');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to generate flashcards');
      }

      const response = await fetch(`/api/preview-flashcards?noteId=${noteId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const data = await response.json();
      
      // Convert string cards to Flashcard objects for preview
      const mockCards: Flashcard[] = data.cards.map((cardText: string, index: number) => ({
        id: `preview-${index}`,
        deck_id: selectedDeckId,
        note_id: noteId,
        user_id: 'preview',
        card_type: cardType,
        cloze_content: cardType === 'cloze' ? cardText : undefined,
        front_content: cardType === 'front_back' ? cardText.split('->')[0] : undefined,
        back_content: cardType === 'front_back' ? cardText.split('->')[1] : undefined,
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

      setPreviewCards(mockCards);
      setStatus('preview');
    } catch (err) {
      console.error('Error generating preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
      setStatus('error');
    }
  }, [noteId, cardType, selectedDeckId]);

  // Generate and save flashcards using the new API
  const generateAndSaveFlashcards = async () => {
    try {
      setStatus('loading');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to generate flashcards');
      }

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
          max_cards: maxCards
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate flashcards');
      }

      const data = await response.json();
      setGeneratedCards(data.flashcards);
      setStatus('saved');
      setActiveTab('review');
    } catch (err) {
      console.error('Error generating flashcards:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
      setStatus('error');
    }
  };

  // Download traditional Anki export
  const downloadAnkiExport = async () => {
    try {
      setStatus('loading');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to download flashcards');
      }

      const response = await fetch(`/api/generate-flashcards?noteId=${noteId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download flashcards');
      }

      const textContent = await response.text();
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_flashcards.txt`;
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setStatus('preview');
    } catch (err) {
      console.error('Error downloading flashcards:', err);
      setError(err instanceof Error ? err.message : 'Failed to download flashcards');
      setStatus('error');
    }
  };

  const renderFlashcardPreview = (card: Flashcard, index: number) => {
    if (card.card_type === 'cloze') {
      const highlightedText = card.cloze_content?.replace(
        /(\{\{c\d+::.*?(?:::.*?)?\}\})/g, 
        '<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded font-medium">$1</span>'
      );
      
      return (
        <div key={index} className="card p-4 mb-4">
          <div className="flex justify-between items-start mb-2">
            <span className="tag text-xs">
              Cloze Deletion
            </span>
            <span className="text-xs text-gray-500">#{index + 1}</span>
          </div>
          <div 
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlightedText || '' }} 
          />
        </div>
      );
    } else {
      return (
        <div key={index} className="card p-4 mb-4">
          <div className="flex justify-between items-start mb-2">
            <span className="tag text-xs">
              Front & Back
            </span>
            <span className="text-xs text-gray-500">#{index + 1}</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Front:
              </div>
              <div className="text-sm">{card.front_content}</div>
            </div>
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Back:
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                {card.back_content}
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Enhanced Flashcard Generator</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            {['generate', 'preview', 'review'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium capitalize border-b-2 ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Generate Tab */}
          {activeTab === 'generate' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cardType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Card Type
                  </label>
                  <select
                    id="cardType"
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value as FlashcardType)}
                    className="input"
                  >
                    <option value="cloze">Cloze Deletion</option>
                    <option value="front_back">Front & Back</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="deck" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target Deck
                  </label>
                  <select
                    id="deck"
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a deck</option>
                    {decks.map(deck => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="maxCards" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Maximum Cards
                  </label>
                  <Input
                    id="maxCards"
                    type="number"
                    min="1"
                    max="50"
                    value={maxCards}
                    onChange={(e) => setMaxCards(parseInt(e.target.value) || 10)}
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <Button 
                  onClick={generatePreview}
                  disabled={status === 'loading' || !selectedDeckId}
                  className="flex-1"
                >
                  {status === 'loading' ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview Cards
                    </>
                  )}
                </Button>

                <Button 
                  onClick={generateAndSaveFlashcards}
                  disabled={status === 'loading' || !selectedDeckId}
                  variant="primary"
                >
                  {status === 'loading' ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create & Save
                    </>
                  )}
                </Button>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                  Enhanced Flashcard System
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• <strong>Integrated Study System:</strong> Cards saved directly for spaced repetition</li>
                  <li>• <strong>Progress Tracking:</strong> Review history and performance analytics</li>
                  <li>• <strong>Mobile Compatible:</strong> Study on web and mobile apps</li>
                  <li>• <strong>Legacy Support:</strong> Still supports traditional Anki export</li>
                </ul>
              </div>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {status === 'loading' && (
                <div className="flex flex-col items-center justify-center p-8">
                  <Spinner className="h-8 w-8 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Generating flashcard preview...
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                  <p>Error: {error}</p>
                  <Button onClick={generatePreview} className="mt-4" variant="outline">
                    Try Again
                  </Button>
                </div>
              )}

              {status === 'preview' && previewCards.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Preview ({previewCards.length} cards)
                    </h3>
                    <div className="flex space-x-2">
                      <Button onClick={downloadAnkiExport} variant="outline">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download for Anki
                      </Button>
                      <Button onClick={generateAndSaveFlashcards}>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Save to Deck
                      </Button>
                    </div>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {previewCards.map((card, index) => renderFlashcardPreview(card, index))}
                  </div>
                </div>
              )}

              {previewCards.length === 0 && status === 'idle' && (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  Click "Preview Cards" to see generated flashcards
                </div>
              )}
            </div>
          )}

          {/* Review Tab */}
          {activeTab === 'review' && (
            <div className="space-y-4">
              {status === 'saved' && generatedCards.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-green-600 dark:text-green-400">
                        ✓ Successfully Created {generatedCards.length} Flashcards
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Cards have been saved to your deck and are ready for study
                      </p>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {generatedCards.map((card, index) => renderFlashcardPreview(card, index))}
                  </div>

                  <div className="flex justify-between items-center mt-6 pt-4 border-t">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Cards saved to: <strong>{decks.find(d => d.id === selectedDeckId)?.name}</strong>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" onClick={onClose}>
                        Close
                      </Button>
                      <Button onClick={() => window.location.href = '/flashcards'}>
                        Study Now
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {status !== 'saved' && (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  Generate and save flashcards to review them here
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}