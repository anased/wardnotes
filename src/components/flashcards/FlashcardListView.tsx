// src/components/flashcards/FlashcardListView.tsx
import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FlashcardService } from '@/services/flashcard';
import type { Flashcard, FlashcardDeck, FlashcardType, FlashcardStatus } from '@/types/flashcard';

interface FlashcardListViewProps {
  deck: FlashcardDeck;
  isOpen: boolean;
  onClose: () => void;
  onFlashcardUpdated?: () => void;
}

interface EditingFlashcard {
  id: string;
  cardType: FlashcardType;
  frontContent: string;
  backContent: string;
  clozeContent: string;
  tags: string[];
}

export function FlashcardListView({ deck, isOpen, onClose, onFlashcardUpdated }: FlashcardListViewProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FlashcardStatus | 'all'>('all');
  const [editingCard, setEditingCard] = useState<EditingFlashcard | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (isOpen && deck) {
      loadFlashcards();
    }
  }, [isOpen, deck]);

  const loadFlashcards = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Get all flashcards for this deck
      const cards = await FlashcardService.getFlashcards({
        deck_id: deck.id
      });
      
      setFlashcards(cards);
    } catch (error) {
      console.error('Failed to load flashcards:', error);
      setError('Failed to load flashcards');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditCard = (flashcard: Flashcard) => {
    setEditingCard({
      id: flashcard.id,
      cardType: flashcard.card_type,
      frontContent: flashcard.front_content || '',
      backContent: flashcard.back_content || '',
      clozeContent: flashcard.cloze_content || '',
      tags: flashcard.tags || []
    });
  };

  const handleSaveEdit = async () => {
    if (!editingCard) return;

    try {
      setIsUpdating(true);
      setError('');

      await FlashcardService.updateFlashcard(editingCard.id, {
        front_content: editingCard.cardType === 'front_back' ? editingCard.frontContent : undefined,
        back_content: editingCard.cardType === 'front_back' ? editingCard.backContent : undefined,
        cloze_content: editingCard.cardType === 'cloze' ? editingCard.clozeContent : undefined,
        tags: editingCard.tags
      });

      setEditingCard(null);
      await loadFlashcards();
      onFlashcardUpdated?.();
    } catch (error) {
      console.error('Failed to update flashcard:', error);
      setError('Failed to update flashcard');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCard = async (flashcard: Flashcard) => {
    const cardPreview = flashcard.card_type === 'front_back' 
      ? flashcard.front_content?.substring(0, 50) + '...'
      : flashcard.cloze_content?.substring(0, 50) + '...';

    if (!confirm(`Are you sure you want to delete this flashcard?\n\n"${cardPreview}"\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setError('');
      await FlashcardService.deleteFlashcard(flashcard.id);
      await loadFlashcards();
      onFlashcardUpdated?.();
    } catch (error) {
      console.error('Failed to delete flashcard:', error);
      setError('Failed to delete flashcard');
    }
  };

  const handleStatusChange = async (flashcard: Flashcard, newStatus: FlashcardStatus) => {
    try {
      await FlashcardService.updateFlashcard(flashcard.id, {
        status: newStatus
      });
      await loadFlashcards();
      onFlashcardUpdated?.();
    } catch (error) {
      console.error('Failed to update flashcard status:', error);
      setError('Failed to update flashcard status');
    }
  };

  const addTag = (tag: string) => {
    if (!editingCard || !tag.trim() || editingCard.tags.includes(tag.trim())) return;
    
    setEditingCard({
      ...editingCard,
      tags: [...editingCard.tags, tag.trim()]
    });
  };

  const removeTag = (tagToRemove: string) => {
    if (!editingCard) return;
    
    setEditingCard({
      ...editingCard,
      tags: editingCard.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const filteredFlashcards = flashcards.filter(flashcard => {
    const matchesSearch = searchQuery === '' || 
      flashcard.front_content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flashcard.back_content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flashcard.cloze_content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flashcard.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || flashcard.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: FlashcardStatus) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'learning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'review': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'mature': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'suspended': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getCardTypeIcon = (cardType: FlashcardType) => {
    if (cardType === 'cloze') {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0a2 2 0 01-2-2v-4a2 2 0 00-2-2H8z" />
      </svg>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-6xl bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-medium">Flashcards in "{deck.name}"</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {filteredFlashcards.length} of {flashcards.length} flashcards
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search flashcards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FlashcardStatus | 'all')}
                className="input w-full"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="learning">Learning</option>
                <option value="review">Review</option>
                <option value="mature">Mature</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredFlashcards.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'No flashcards match your filters.' 
                  : 'No flashcards in this deck yet.'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFlashcards.map((flashcard) => (
                <div
                  key={flashcard.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
                >
                  {editingCard?.id === flashcard.id ? (
                    /* Edit Mode */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getCardTypeIcon(flashcard.card_type)}
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Editing {flashcard.card_type === 'front_back' ? 'Front & Back' : 'Cloze'} Card
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            onClick={handleSaveEdit}
                            disabled={isUpdating}
                            className="px-3 py-1 text-sm"
                          >
                            {isUpdating ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditingCard(null)}
                            disabled={isUpdating}
                            className="px-3 py-1 text-sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>

                      {flashcard.card_type === 'front_back' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Front
                            </label>
                            <textarea
                              value={editingCard.frontContent}
                              onChange={(e) => setEditingCard({
                                ...editingCard,
                                frontContent: e.target.value
                              })}
                              className="input w-full h-24 resize-none"
                              placeholder="Front of the card..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Back
                            </label>
                            <textarea
                              value={editingCard.backContent}
                              onChange={(e) => setEditingCard({
                                ...editingCard,
                                backContent: e.target.value
                              })}
                              className="input w-full h-24 resize-none"
                              placeholder="Back of the card..."
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Cloze Content
                          </label>
                          <textarea
                            value={editingCard.clozeContent}
                            onChange={(e) => setEditingCard({
                              ...editingCard,
                              clozeContent: e.target.value
                            })}
                            className="input w-full h-24 resize-none"
                            placeholder="Content with {{c1::deletions}}..."
                          />
                        </div>
                      )}

                      {/* Tags editing */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {editingCard.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          className="input w-full"
                          placeholder="Add tag and press Enter..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getCardTypeIcon(flashcard.card_type)}
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {flashcard.card_type === 'front_back' ? 'Front & Back' : 'Cloze'}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(flashcard.status)}`}>
                            {flashcard.status}
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <select
                            value={flashcard.status}
                            onChange={(e) => handleStatusChange(flashcard, e.target.value as FlashcardStatus)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600"
                          >
                            <option value="new">New</option>
                            <option value="learning">Learning</option>
                            <option value="review">Review</option>
                            <option value="mature">Mature</option>
                            <option value="suspended">Suspended</option>
                          </select>
                          <Button
                            variant="outline"
                            onClick={() => handleEditCard(flashcard)}
                            className="px-2 py-1 text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleDeleteCard(flashcard)}
                            className="px-2 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      </div>

                      {flashcard.card_type === 'front_back' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Front</h5>
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                              {flashcard.front_content || <em className="text-gray-500">Empty</em>}
                            </div>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Back</h5>
                            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                              {flashcard.back_content || <em className="text-gray-500">Empty</em>}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3">
                          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cloze Content</h5>
                          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                            {flashcard.cloze_content || <em className="text-gray-500">Empty</em>}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {flashcard.tags && flashcard.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {flashcard.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-block px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Study stats */}
                      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex space-x-4">
                        <span>Reviews: {flashcard.total_reviews}</span>
                        <span>Accuracy: {flashcard.total_reviews > 0 ? Math.round((flashcard.correct_reviews / flashcard.total_reviews) * 100) : 0}%</span>
                        <span>Ease: {flashcard.ease_factor.toFixed(1)}</span>
                        <span>Interval: {flashcard.interval_days}d</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}