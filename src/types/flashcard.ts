// src/lib/types/flashcard.ts
export type FlashcardType = 'cloze' | 'front_back';
export type FlashcardStatus = 'new' | 'learning' | 'review' | 'mature' | 'suspended';
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface FlashcardDeck {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  note_id?: string;
  user_id: string;
  
  // Card content
  card_type: FlashcardType;
  front_content?: string;
  back_content?: string;
  cloze_content?: string;
  
  // Spaced repetition data
  status: FlashcardStatus;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  last_reviewed?: string;
  next_review: string;
  
  // Statistics
  total_reviews: number;
  correct_reviews: number;
  
  // Metadata
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FlashcardReview {
  id: string;
  flashcard_id: string;
  user_id: string;
  
  // Review data
  reviewed_at: string;
  quality: ReviewQuality;
  response_time?: number;
  
  // State changes
  previous_ease_factor: number;
  previous_interval: number;
  previous_repetitions: number;
  new_ease_factor: number;
  new_interval: number;
  new_repetitions: number;
}

export interface FlashcardStudySession {
  id: string;
  user_id: string;
  deck_id?: string;
  
  // Session data
  started_at: string;
  ended_at?: string;
  cards_studied: number;
  cards_correct: number;
  total_time: number;
  session_type: 'review' | 'new' | 'mixed';
}

export interface FlashcardGeneration {
  id: string;
  note_id: string;
  user_id: string;
  cards: string[] | FlashcardData[];
  card_type: FlashcardType;
  created_at: string;
  updated_at: string;
}

// For the integrated system
export interface FlashcardData {
  type: FlashcardType;
  content: string;
  front?: string;
  back?: string;
  cloze?: string;
  tags?: string[];
}

// Study session interfaces
export interface StudySessionStats {
  totalCards: number;
  correctCards: number;
  accuracy: number;
  averageTime: number;
  newCards: number;
  reviewCards: number;
  learningCards: number;
}

export interface DeckStats {
  totalCards: number;
  newCards: number;
  dueCards: number;
  learningCards: number;
  matureCards: number;
  suspendedCards: number;
}

// API interfaces
export interface CreateFlashcardRequest {
  deck_id: string;
  note_id?: string;
  card_type: FlashcardType;
  front_content?: string;
  back_content?: string;
  cloze_content?: string;
  tags?: string[];
}

export interface UpdateFlashcardRequest {
  // Content updates
  front_content?: string;
  back_content?: string;
  cloze_content?: string;
  tags?: string[];
  
  // Status updates
  status?: FlashcardStatus;
  
  // Spaced repetition updates (for review submissions)
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  last_reviewed?: string;
  next_review?: string;
  total_reviews?: number;
  correct_reviews?: number;
}

export interface SubmitReviewRequest {
  flashcard_id: string;
  quality: ReviewQuality;
  response_time?: number;
}

export interface GenerateFlashcardsRequest {
  note_id: string;
  card_type: FlashcardType;
  deck_id?: string;
  max_cards?: number;
}

export interface FlashcardSearchFilters {
  deck_id?: string;
  status?: FlashcardStatus;
  card_type?: FlashcardType;
  tags?: string[];
  due_only?: boolean;
  search_text?: string;
}

// Mobile-specific interfaces
export interface MobileFlashcardSession {
  session_id: string;
  deck_id: string;
  cards: Flashcard[];
  current_index: number;
  start_time: number;
  reviews: FlashcardReview[];
}

export interface MobileStudyMode {
  mode: 'new' | 'review' | 'mixed';
  card_limit?: number;
  time_limit?: number;
  show_answer_immediately?: boolean;
}

// Component props interfaces
export interface FlashcardViewProps {
  flashcard: Flashcard;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onSubmitReview: (quality: ReviewQuality) => void;
  isLoading?: boolean;
}

export interface DeckViewProps {
  deck: FlashcardDeck;
  stats: DeckStats;
  onStartStudy: () => void;
  onEditDeck: () => void;
  onDeleteDeck: () => void;
}

export interface StudySessionProps {
  deck: FlashcardDeck;
  mode: MobileStudyMode;
  onSessionComplete: (stats: StudySessionStats) => void;
  onSessionPause: () => void;
}

// Utility types
export type FlashcardWithDeck = Flashcard & {
  deck: FlashcardDeck;
};

export type FlashcardWithReviews = Flashcard & {
  reviews: FlashcardReview[];
};

export type DeckWithStats = FlashcardDeck & {
  stats: DeckStats;
};

// Database types (extending existing types)
export interface Database {
  public: {
    Tables: {
      flashcard_decks: {
        Row: FlashcardDeck;
        Insert: Omit<FlashcardDeck, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FlashcardDeck, 'id' | 'user_id' | 'created_at'>>;
      };
      flashcards: {
        Row: Flashcard;
        Insert: Omit<Flashcard, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Flashcard, 'id' | 'user_id' | 'created_at'>>;
      };
      flashcard_reviews: {
        Row: FlashcardReview;
        Insert: Omit<FlashcardReview, 'id'>;
        Update: never;
      };
      flashcard_study_sessions: {
        Row: FlashcardStudySession;
        Insert: Omit<FlashcardStudySession, 'id' | 'started_at'>;
        Update: Partial<Omit<FlashcardStudySession, 'id' | 'user_id' | 'started_at'>>;
      };
      flashcard_generations: {
        Row: FlashcardGeneration;
        Insert: Omit<FlashcardGeneration, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FlashcardGeneration, 'id' | 'user_id' | 'created_at'>>;
      };
    };
    Enums: {
      flashcard_type: FlashcardType;
      flashcard_status: FlashcardStatus;
    };
  };
}