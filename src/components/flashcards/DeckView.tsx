// src/components/flashcards/DeckView.tsx
import React from 'react';
import Button from '@/components/ui/Button';
import type { FlashcardDeck, DeckStats } from '@/types/flashcard';

interface DeckViewProps {
  deck: FlashcardDeck;
  stats: DeckStats;
  onStartStudy: () => void;
  onEditDeck: () => void;
  onDeleteDeck: () => void;
  onViewCards: () => void; // New prop for viewing cards list
}

export function DeckView({ 
  deck, 
  stats, 
  onStartStudy, 
  onEditDeck, 
  onDeleteDeck, 
  onViewCards 
}: DeckViewProps) {
  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div 
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: deck.color }}
          />
          <h3 className="text-lg font-medium">{deck.name}</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onViewCards}
            className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
            title="View all cards"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={onEditDeck}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Edit deck"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDeleteDeck}
            className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
            title="Delete deck"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      {deck.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {deck.description}
        </p>
      )}
      
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.dueCards}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Due</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.newCards}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">New</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {stats.totalCards}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {stats.learningCards > 0 && (
          <span className="tag">
            {stats.learningCards} Learning
          </span>
        )}
        {stats.matureCards > 0 && (
          <span className="tag">
            {stats.matureCards} Mature
          </span>
        )}
        {stats.suspendedCards > 0 && (
          <span className="px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full dark:bg-red-700 dark:text-red-300">
            {stats.suspendedCards} Suspended
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        {/* Primary Study Button */}
        <Button 
          onClick={onStartStudy} 
          fullWidth
          disabled={stats.dueCards === 0}
          className="flex items-center justify-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h1m4 0h1m-6 4h.01M15 10h.01M12 21l-2.172-2.172a4 4 0 00-5.656 0L2 21l2.172-2.172a4 4 0 015.656 0L12 17l2.172 2.172a4 4 0 005.656 0L22 21z" />
          </svg>
          {stats.dueCards > 0 ? `Study ${stats.dueCards} Cards` : 'No Cards Due'}
        </Button>

        {/* View Cards Button */}
        <Button 
          onClick={onViewCards} 
          variant="outline"
          fullWidth
          className="flex items-center justify-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          View All Cards ({stats.totalCards})
        </Button>
      </div>
    </div>
  );
}