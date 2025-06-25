// Updated src/components/flashcards/DeckManagementModal.tsx
import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FlashcardService } from '@/services/flashcard';
import type { FlashcardDeck } from '@/types/flashcard';

interface DeckManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckCreated: () => void;
  editingDeck?: FlashcardDeck | null; // Add this prop
}

export function DeckManagementModal({ 
  isOpen, 
  onClose, 
  onDeckCreated, 
  editingDeck = null 
}: DeckManagementModalProps) {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Create/Edit deck form
  const [deckName, setDeckName] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [deckColor, setDeckColor] = useState('#3B82F6');
  const [isCreating, setIsCreating] = useState(false);
  
  // Internal edit state (for the deck list within this modal)
  const [internalEditingDeck, setInternalEditingDeck] = useState<FlashcardDeck | null>(null);

  const colors = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Yellow', value: '#F59E0B' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Gray', value: '#6B7280' },
  ];

  useEffect(() => {
    if (isOpen) {
      loadDecks();
      
      // If we're editing a deck from the parent, populate the form
      if (editingDeck) {
        setDeckName(editingDeck.name);
        setDeckDescription(editingDeck.description || '');
        setDeckColor(editingDeck.color);
        setInternalEditingDeck(editingDeck);
      } else {
        // Reset form for new deck creation
        resetForm();
      }
    }
  }, [isOpen, editingDeck]);

  const loadDecks = async () => {
    try {
      setIsLoading(true);
      const decksData = await FlashcardService.getDecks();
      setDecks(decksData);
    } catch (error) {
      console.error('Failed to load decks:', error);
      setError('Failed to load decks');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setDeckName('');
    setDeckDescription('');
    setDeckColor('#3B82F6');
    setInternalEditingDeck(null);
    setError('');
  };

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deckName.trim()) {
      setError('Deck name is required');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      const currentEditingDeck = editingDeck || internalEditingDeck;

      if (currentEditingDeck) {
        // Update existing deck
        await FlashcardService.updateDeck(currentEditingDeck.id, {
          name: deckName,
          description: deckDescription,
          color: deckColor
        });
      } else {
        // Create new deck
        await FlashcardService.createDeck(deckName, deckDescription, deckColor);
      }

      // Reset form
      resetForm();
      
      // Reload decks and notify parent
      await loadDecks();
      onDeckCreated();

      // If we were editing from parent, close the modal
      if (editingDeck) {
        onClose();
      }
    } catch (error) {
      console.error('Failed to save deck:', error);
      setError('Failed to save deck');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditDeck = (deck: FlashcardDeck) => {
    setInternalEditingDeck(deck);
    setDeckName(deck.name);
    setDeckDescription(deck.description || '');
    setDeckColor(deck.color);
  };

  const handleDeleteDeck = async (deckId: string) => {
    const deckToDelete = decks.find(d => d.id === deckId);
    
    if (!deckToDelete) return;

    // Prevent deletion of default deck
    if (deckToDelete.name === 'Default Deck') {
      setError('Cannot delete the default deck');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${deckToDelete.name}"?\n\nThis will permanently delete the deck and all its flashcards. This action cannot be undone.`)) {
      return;
    }

    try {
      await FlashcardService.deleteDeck(deckId);
      await loadDecks();
      onDeckCreated(); // Notify parent to refresh
      setError('');
    } catch (error) {
      console.error('Failed to delete deck:', error);
      setError('Failed to delete deck');
    }
  };

  if (!isOpen) return null;

  const currentEditingDeck = editingDeck || internalEditingDeck;
  const isEditMode = !!currentEditingDeck;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">
            {editingDeck ? 'Edit Deck' : 'Manage Flashcard Decks'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Create/Edit Deck Form */}
          <form onSubmit={handleCreateDeck} className="space-y-4">
            <h4 className="text-md font-medium">
              {isEditMode ? 'Edit Deck' : 'Create New Deck'}
            </h4>
            
            {error && (
              <div className="p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="deckName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Deck Name *
              </label>
              <Input
                id="deckName"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="e.g., Cardiology, Anatomy, USMLE Step 1"
                required
              />
            </div>

            <div>
              <label htmlFor="deckDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description (Optional)
              </label>
              <textarea
                id="deckDescription"
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                placeholder="Brief description of what this deck contains"
                rows={2}
                className="input resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Deck Color
              </label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setDeckColor(color.value)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      deckColor === color.value 
                        ? 'border-gray-800 dark:border-white scale-110' 
                        : 'border-gray-300 dark:border-gray-600'
                    } transition-all`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              {isEditMode && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button type="submit" isLoading={isCreating}>
                {isEditMode ? 'Update Deck' : 'Create Deck'}
              </Button>
            </div>
          </form>

          {/* Existing Decks List (only show if not editing from parent) */}
          {!editingDeck && (
            <div>
              <h4 className="text-md font-medium mb-4">Your Decks ({decks.length})</h4>
              
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : decks.length === 0 ? (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>No decks yet. Create your first deck above!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {decks.map((deck) => (
                    <div key={deck.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: deck.color }}
                        />
                        <div>
                          <h5 className="font-medium">{deck.name}</h5>
                          {deck.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {deck.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            Created {new Date(deck.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditDeck(deck)}
                          className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                          title="Edit deck"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {deck.name !== 'Default Deck' && (
                          <button
                            onClick={() => handleDeleteDeck(deck.id)}
                            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                            title="Delete deck"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}