// Updated src/components/flashcards/CreateFlashCardModal.tsx
import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FlashcardService } from '@/services/flashcard';
import { DeckManagementModal } from './DeckManagementModal';
import { ClozeEditor } from './ClozeEditor'; // Import the new component
import type { FlashcardDeck, FlashcardType } from '@/types/flashcard';

interface CreateFlashcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  decks: FlashcardDeck[];
  selectedDeckId?: string;
  onFlashcardCreated: () => void;
  noteId?: string;
  noteTags?: string[];
  referenceText?: string;
  initialCardType?: FlashcardType;
}

export function CreateFlashcardModal({
  isOpen,
  onClose,
  decks,
  selectedDeckId,
  onFlashcardCreated,
  noteId,
  noteTags = [],
  referenceText,
  initialCardType,
}: CreateFlashcardModalProps) {
  const [cardType, setCardType] = useState<FlashcardType>(initialCardType || 'front_back');
  const [deckId, setDeckId] = useState(selectedDeckId || '');
  const [frontContent, setFrontContent] = useState('');
  const [backContent, setBackContent] = useState('');
  const [clozeContent, setClozeContent] = useState('');
  const [tags, setTags] = useState<string[]>(noteTags);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeckManagement, setShowDeckManagement] = useState(false);

  // Pre-fill cloze content when reference text is provided and card type is cloze
  useEffect(() => {
    if (referenceText && cardType === 'cloze' && !clozeContent) {
      setClozeContent(referenceText);
    }
  }, [referenceText, cardType, clozeContent]);

  // Pre-fill front content when reference text is provided and card type is front_back
  useEffect(() => {
    if (referenceText && cardType === 'front_back' && !frontContent) {
      setFrontContent(referenceText);
    }
  }, [referenceText, cardType, frontContent]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deckId) {
      setError('Please select a deck');
      return;
    }

    if (cardType === 'front_back' && (!frontContent.trim() || !backContent.trim())) {
      setError('Please fill in both front and back content');
      return;
    }

    if (cardType === 'cloze' && !clozeContent.trim()) {
      setError('Please fill in the cloze content');
      return;
    }

    // Validate cloze content has at least one cloze deletion
    if (cardType === 'cloze' && !clozeContent.includes('{{c')) {
      setError('Cloze content must include at least one cloze deletion. Select text and click "Make Cloze".');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      await FlashcardService.createFlashcard({
        deck_id: deckId,
        note_id: noteId,
        card_type: cardType,
        front_content: cardType === 'front_back' ? frontContent : undefined,
        back_content: cardType === 'front_back' ? backContent : undefined,
        cloze_content: cardType === 'cloze' ? clozeContent : undefined,
        tags: tags.length > 0 ? tags : noteTags,
      });

      onFlashcardCreated();
      onClose();
      
      // Reset form
      setFrontContent('');
      setBackContent('');
      setClozeContent('');
      setTags([]);
      setTagInput('');
    } catch (error) {
      console.error('Failed to create flashcard:', error);
      setError('Failed to create flashcard. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Create New Flashcard</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Reference Text Display */}
          {referenceText && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Selected text reference:
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 italic">
                    &quot;{referenceText}&quot;
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Use this text as a reference when creating your flashcard
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Deck Selection with Management Button */}
          <div>
            <label htmlFor="deck" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Deck
            </label>
            <div className="flex space-x-2">
              <select
                id="deck"
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className="input flex-1"
                required
              >
                <option value="">Select a deck</option>
                {decks.map(deck => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowDeckManagement(true)}
                className="whitespace-nowrap"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage
              </Button>
            </div>
            {decks.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                No decks available. Click "Manage" to create your first deck.
              </p>
            )}
          </div>

          {/* Card Type Selection */}
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
              <option value="front_back">Front & Back</option>
              <option value="cloze">Cloze Deletion</option>
            </select>
            {cardType === 'cloze' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                💡 Cloze deletions are great for fill-in-the-blank style learning. Just type your content and select words to convert!
              </p>
            )}
          </div>

          {/* Card Content */}
          {cardType === 'front_back' ? (
            <>
              <div>
                <label htmlFor="front" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Front (Question)
                </label>
                <textarea
                  id="front"
                  value={frontContent}
                  onChange={(e) => setFrontContent(e.target.value)}
                  placeholder="Enter the question or prompt"
                  rows={3}
                  className="input resize-none"
                  required
                />
              </div>
              <div>
                <label htmlFor="back" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Back (Answer)
                </label>
                <textarea
                  id="back"
                  value={backContent}
                  onChange={(e) => setBackContent(e.target.value)}
                  placeholder="Enter the answer"
                  rows={3}
                  className="input resize-none"
                  required
                />
              </div>
            </>
          ) : (
            <ClozeEditor
              value={clozeContent}
              onChange={setClozeContent}
              placeholder="Enter your content, then select text and click 'Make Cloze' to create cloze deletions"
              rows={5}
            />
          )}

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags
            </label>
            <div className="flex space-x-2 mb-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="flex-1"
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="tag flex items-center space-x-1">
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-500"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Create Flashcard
            </Button>
          </div>
        </form>
      </div>

      {/* Deck Management Modal */}
      <DeckManagementModal
        isOpen={showDeckManagement}
        onClose={() => setShowDeckManagement(false)}
        onDeckCreated={onFlashcardCreated}
      />
    </div>
  );
}