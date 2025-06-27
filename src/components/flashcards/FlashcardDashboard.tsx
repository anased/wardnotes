// src/components/flashcards/FlashcardDashboard.tsx
import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { DeckView } from './DeckView';
import { CreateFlashcardModal } from './CreateFlashCardModal';
import { StudySession } from './StudySession';
import { DeckManagementModal } from './DeckManagementModal';
import { FlashcardListView } from './FlashcardListView';
import { FlashcardService } from '@/services/flashcard';
import type { FlashcardDeck, DeckStats, StudySessionStats } from '@/types/flashcard';

export function FlashcardDashboard() {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [deckStats, setDeckStats] = useState<Record<string, DeckStats>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeckManagementOpen, setIsDeckManagementOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<FlashcardDeck | null>(null);
  const [studyingDeck, setStudyingDeck] = useState<FlashcardDeck | null>(null);
  const [viewingCardsDeck, setViewingCardsDeck] = useState<FlashcardDeck | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load decks and stats
  const loadDecks = async () => {
    try {
      setIsLoading(true);
      const decksData = await FlashcardService.getDecks();
      setDecks(decksData);

      // Load stats for each deck
      const statsPromises = decksData.map(async (deck) => {
        const stats = await FlashcardService.getDeckStats(deck.id);
        return { deckId: deck.id, stats };
      });

      const statsResults = await Promise.all(statsPromises);
      const statsMap = statsResults.reduce((acc, { deckId, stats }) => {
        acc[deckId] = stats;
        return acc;
      }, {} as Record<string, DeckStats>);

      setDeckStats(statsMap);
    } catch (error) {
      console.error('Failed to load decks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load analytics
  const loadAnalytics = async () => {
    try {
      const analyticsData = await FlashcardService.getStudyAnalytics(30);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  useEffect(() => {
    loadDecks();
    loadAnalytics();
  }, []);

  const filteredDecks = decks.filter(deck =>
    deck.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    deck.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalStats = Object.values(deckStats).reduce(
    (acc, stats) => ({
      totalCards: acc.totalCards + stats.totalCards,
      dueCards: acc.dueCards + stats.dueCards,
      newCards: acc.newCards + stats.newCards
    }),
    { totalCards: 0, dueCards: 0, newCards: 0 }
  );

  const handleStartStudy = (deck: FlashcardDeck) => {
    setStudyingDeck(deck);
  };

  const handleEditDeck = (deck: FlashcardDeck) => {
    setEditingDeck(deck);
    setIsDeckManagementOpen(true);
  };

  const handleViewCards = (deck: FlashcardDeck) => {
    setViewingCardsDeck(deck);
  };

  const handleDeleteDeck = async (deck: FlashcardDeck) => {
    // Prevent deletion of default deck
    if (deck.name === 'Default Deck') {
      alert('Cannot delete the default deck');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${deck.name}"?\n\nThis will permanently delete the deck and all its flashcards. This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await FlashcardService.deleteDeck(deck.id);
      await loadDecks(); // Refresh the deck list
    } catch (error) {
      console.error('Failed to delete deck:', error);
      alert('Failed to delete deck. Please try again.');
    }
  };

  const handleSessionComplete = (stats: StudySessionStats) => {
    setStudyingDeck(null);
    loadDecks(); // Refresh deck stats
    loadAnalytics(); // Refresh analytics
  };

  const handleSessionPause = () => {
    setStudyingDeck(null);
  };

  const handleDeckManagementClose = () => {
    setIsDeckManagementOpen(false);
    setEditingDeck(null);
  };

  const handleDeckCreatedOrUpdated = () => {
    loadDecks(); // Refresh the deck list
  };

  const handleFlashcardUpdated = () => {
    loadDecks(); // Refresh deck stats when flashcards are updated
  };

  if (studyingDeck) {
    return (
      <div className="container mx-auto px-4 py-8">
        <StudySession
          deck={studyingDeck}
          onSessionComplete={handleSessionComplete}
          onSessionPause={handleSessionPause}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Flashcards</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Study with spaced repetition
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Flashcard
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {totalStats.dueCards}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Due Today
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {analytics ? Math.round(analytics.accuracy) : 0}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Accuracy
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {totalStats.totalCards}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Cards
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          type="text"
          placeholder="Search decks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Deck Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredDecks.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-gray-500 dark:text-gray-400 mb-4">
            {searchQuery ? 'No decks found matching your search.' : 'No flashcard decks yet.'}
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Flashcard
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDecks.map(deck => (
            <DeckView
              key={deck.id}
              deck={deck}
              stats={deckStats[deck.id] || {
                totalCards: 0,
                newCards: 0,
                dueCards: 0,
                learningCards: 0,
                matureCards: 0,
                suspendedCards: 0
              }}
              onStartStudy={() => handleStartStudy(deck)}
              onEditDeck={() => handleEditDeck(deck)}
              onDeleteDeck={() => handleDeleteDeck(deck)}
              onViewCards={() => handleViewCards(deck)}
            />
          ))}
        </div>
      )}

      {/* Create Flashcard Modal */}
      <CreateFlashcardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        decks={decks}
        onFlashcardCreated={loadDecks}
      />

      {/* Deck Management Modal */}
      <DeckManagementModal
        isOpen={isDeckManagementOpen}
        onClose={handleDeckManagementClose}
        onDeckCreated={handleDeckCreatedOrUpdated}
        editingDeck={editingDeck}
      />

      {/* Flashcard List View Modal */}
      {viewingCardsDeck && (
        <FlashcardListView
          deck={viewingCardsDeck}
          isOpen={!!viewingCardsDeck}
          onClose={() => setViewingCardsDeck(null)}
          onFlashcardUpdated={handleFlashcardUpdated}
        />
      )}
    </div>
  );
}