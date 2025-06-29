// src/lib/services/flashcard.ts
import { supabase } from '@/lib/supabase/client';
import type {
  Flashcard,
  FlashcardDeck,
  FlashcardReview,
  FlashcardStudySession,
  CreateFlashcardRequest,
  UpdateFlashcardRequest,
  SubmitReviewRequest,
  ReviewQuality,
  FlashcardSearchFilters,
  DeckStats,
  StudySessionStats
} from '@/types/flashcard';

export class FlashcardService {
  
  // Helper method to get authenticated user
  private static async getAuthenticatedUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      throw new Error('User must be authenticated');
    }
    return user;
  }
  
  // ======================
  // Deck Management
  // ======================
  
  static async getDecks(): Promise<FlashcardDeck[]> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_decks')
      .select('*')
      .eq('user_id', user.id)  // Add user filter
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async getDeck(id: string): Promise<FlashcardDeck | null> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_decks')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)  // Add user filter
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async createDeck(name: string, description?: string, color?: string): Promise<FlashcardDeck> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_decks')
      .insert({
        name,
        description,
        color: color || '#3B82F6',
        user_id: user.id  // Add missing user_id
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async updateDeck(id: string, updates: Partial<FlashcardDeck>): Promise<FlashcardDeck> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_decks')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)  // Add user filter
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async deleteDeck(id: string): Promise<void> {
    const user = await this.getAuthenticatedUser();
    
    const { error } = await supabase
      .from('flashcard_decks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);  // Add user filter
    
    if (error) throw error;
  }
  
  static async getDeckStats(deckId: string): Promise<DeckStats> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcards')
      .select('status, next_review')
      .eq('deck_id', deckId)
      .eq('user_id', user.id);
    
    if (error) throw error;
    
    const now = new Date();
    const stats: DeckStats = {
      totalCards: data?.length || 0,
      newCards: 0,
      dueCards: 0,
      learningCards: 0,
      matureCards: 0,
      suspendedCards: 0
    };
    
    data?.forEach(card => {
      switch (card.status) {
        case 'new':
          stats.newCards++;
          stats.dueCards++; // ✅ NEW CARDS SHOULD BE DUE!
          break;
        case 'learning':
          stats.learningCards++;
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'review':
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'mature':
          stats.matureCards++;
          if (new Date(card.next_review) <= now) {
            stats.dueCards++;
          }
          break;
        case 'suspended':
          stats.suspendedCards++;
          break;
      }
    });
    
    return stats;
  }
  
  // ======================
  // Flashcard Management
  // ======================
  
  static async getFlashcards(filters?: FlashcardSearchFilters): Promise<Flashcard[]> {
    const user = await this.getAuthenticatedUser();
    
    let query = supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id);  // Add user filter
    
    if (filters?.deck_id) {
      query = query.eq('deck_id', filters.deck_id);
    }
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters?.card_type) {
      query = query.eq('card_type', filters.card_type);
    }
    
    if (filters?.due_only) {
      query = query.lte('next_review', new Date().toISOString());
    }
    
    if (filters?.tags?.length) {
      query = query.overlaps('tags', filters.tags);
    }
    
    if (filters?.search_text) {
      query = query.or(`front_content.ilike.%${filters.search_text}%,back_content.ilike.%${filters.search_text}%,cloze_content.ilike.%${filters.search_text}%`);
    }
    
    query = query.order('next_review', { ascending: true });
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  
  static async getFlashcard(id: string): Promise<Flashcard | null> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)  // Add user filter
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async createFlashcard(request: CreateFlashcardRequest): Promise<Flashcard> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        deck_id: request.deck_id,
        note_id: request.note_id,
        card_type: request.card_type,
        front_content: request.front_content,
        back_content: request.back_content,
        cloze_content: request.cloze_content,
        tags: request.tags || [],
        status: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        next_review: new Date().toISOString(),
        total_reviews: 0,
        correct_reviews: 0,
        user_id: user.id  // Add missing user_id
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async updateFlashcard(id: string, request: UpdateFlashcardRequest): Promise<Flashcard> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcards')
      .update({
        ...request,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)  // Add user filter
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async deleteFlashcard(id: string): Promise<void> {
    const user = await this.getAuthenticatedUser();
    
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);  // Add user filter
    
    if (error) throw error;
  }
  
  static async getDueCards(deckId?: string, limit?: number): Promise<Flashcard[]> {
    const user = await this.getAuthenticatedUser();
    
    let query = supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id)  // Add user filter
      .lte('next_review', new Date().toISOString())
      .neq('status', 'suspended')
      .order('next_review', { ascending: true });
    
    if (deckId) {
      query = query.eq('deck_id', deckId);
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  
  static async getFlashcardsDue(deckId?: string, limit: number = 50): Promise<Flashcard[]> {
    return this.getDueCards(deckId, limit);
  }
  
  static async getNewFlashcards(deckId?: string, limit: number = 20): Promise<Flashcard[]> {
    const user = await this.getAuthenticatedUser();
    
    let query = supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'new')
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (deckId) {
      query = query.eq('deck_id', deckId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  static async getStudyCards(deckId?: string, maxDue: number = 30, maxNew: number = 10): Promise<Flashcard[]> {
    const [dueCards, newCards] = await Promise.all([
      this.getFlashcardsDue(deckId, maxDue),
      this.getNewFlashcards(deckId, maxNew)
    ]);
    
    // Combine and shuffle
    const allCards = [...dueCards, ...newCards];
    return allCards.sort(() => Math.random() - 0.5);
  }


  // ======================
  // Review System
  // ======================
  
  static async submitReview(request: SubmitReviewRequest): Promise<Flashcard> {
    const user = await this.getAuthenticatedUser();
    
    // Get current flashcard state
    const flashcard = await this.getFlashcard(request.flashcard_id);
    if (!flashcard) {
      throw new Error('Flashcard not found');
    }
    
    // Calculate new spaced repetition values
    const { newEaseFactor, newInterval, newRepetitions, nextReviewDate } = 
      this.calculateNextReview(
        request.quality,
        flashcard.ease_factor,
        flashcard.interval_days,
        flashcard.repetitions
      );
    
    // Determine new status
    const newStatus = this.determineNewStatus(newRepetitions, request.quality);
    
    // Create review record
    const reviewData: Omit<FlashcardReview, 'id'> = {
      flashcard_id: request.flashcard_id,
      user_id: user.id,  // Use authenticated user
      reviewed_at: new Date().toISOString(),
      quality: request.quality,
      response_time: request.response_time,
      previous_ease_factor: flashcard.ease_factor,
      previous_interval: flashcard.interval_days,
      previous_repetitions: flashcard.repetitions,
      new_ease_factor: newEaseFactor,
      new_interval: newInterval,
      new_repetitions: newRepetitions
    };
    
    // Save review
    const { error: reviewError } = await supabase
      .from('flashcard_reviews')
      .insert(reviewData);
    
    if (reviewError) throw reviewError;
    
    // Update flashcard
    const updatedFlashcard = await this.updateFlashcard(request.flashcard_id, {
      status: newStatus as any,
      ease_factor: newEaseFactor,
      interval_days: newInterval,
      repetitions: newRepetitions,
      last_reviewed: new Date().toISOString(),
      next_review: nextReviewDate.toISOString(),
      total_reviews: flashcard.total_reviews + 1,
      correct_reviews: flashcard.correct_reviews + (request.quality >= 3 ? 1 : 0)
    });
    
    return updatedFlashcard;
  }
  
  static async submitReviewById(flashcardId: string, quality: ReviewQuality, responseTime?: number): Promise<Flashcard> {
    return this.submitReview({
      flashcard_id: flashcardId,
      quality,
      response_time: responseTime
    });
  }

  static async getReviewHistory(flashcardId: string): Promise<FlashcardReview[]> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_reviews')
      .select('*')
      .eq('flashcard_id', flashcardId)
      .eq('user_id', user.id)  // Add user filter
      .order('reviewed_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  // ======================
  // Study Sessions
  // ======================
  
  static async startStudySession(deckId?: string, sessionType: 'review' | 'new' | 'mixed' = 'review'): Promise<FlashcardStudySession> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_study_sessions')
      .insert({
        deck_id: deckId,
        session_type: sessionType,
        cards_studied: 0,
        cards_correct: 0,
        total_time: 0,
        user_id: user.id  // Add missing user_id
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async updateStudySession(
    sessionId: string, 
    updates: Partial<FlashcardStudySession>
  ): Promise<FlashcardStudySession> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_study_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('user_id', user.id)  // Add user filter
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async endStudySession(sessionId: string): Promise<FlashcardStudySession> {
    const user = await this.getAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('flashcard_study_sessions')
      .update({
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)  // Add user filter
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async getStudySessionStats(sessionId: string): Promise<StudySessionStats> {
    const user = await this.getAuthenticatedUser();
    
    const session = await supabase
      .from('flashcard_study_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)  // Add user filter
      .single();
    
    if (session.error) throw session.error;
    
    const reviews = await supabase
      .from('flashcard_reviews')
      .select('*')
      .eq('user_id', user.id)  // Add user filter
      .gte('reviewed_at', session.data.started_at)
      .lte('reviewed_at', session.data.ended_at || new Date().toISOString());
    
    if (reviews.error) throw reviews.error;
    
    const stats: StudySessionStats = {
      totalCards: session.data.cards_studied,
      correctCards: session.data.cards_correct,
      accuracy: session.data.cards_studied > 0 ? (session.data.cards_correct / session.data.cards_studied) * 100 : 0,
      averageTime: session.data.cards_studied > 0 ? session.data.total_time / session.data.cards_studied : 0,
      newCards: reviews.data?.filter(r => r.previous_repetitions === 0).length || 0,
      reviewCards: reviews.data?.filter(r => r.previous_repetitions > 0).length || 0,
      learningCards: reviews.data?.filter(r => r.quality < 3).length || 0
    };
    
    return stats;
  }
  
  // ======================
  // Bulk Operations
  // ======================
  
  static async bulkCreateFlashcards(cards: CreateFlashcardRequest[]): Promise<Flashcard[]> {
    const user = await this.getAuthenticatedUser();
    
    const cardsToInsert = cards.map(card => ({
      deck_id: card.deck_id,
      note_id: card.note_id,
      card_type: card.card_type,
      front_content: card.front_content,
      back_content: card.back_content,
      cloze_content: card.cloze_content,
      tags: card.tags || [],
      status: 'new' as const,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      next_review: new Date().toISOString(),
      total_reviews: 0,
      correct_reviews: 0,
      user_id: user.id  // Add missing user_id
    }));
    
    const { data, error } = await supabase
      .from('flashcards')
      .insert(cardsToInsert)
      .select();
    
    if (error) throw error;
    return data || [];
  }
  
  static async bulkDeleteFlashcards(ids: string[]): Promise<void> {
    const user = await this.getAuthenticatedUser();
    
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);  // Add user filter
    
    if (error) throw error;
  }
  
  static async suspendFlashcards(ids: string[]): Promise<void> {
    const user = await this.getAuthenticatedUser();
    
    const { error } = await supabase
      .from('flashcards')
      .update({ status: 'suspended' })
      .in('id', ids)
      .eq('user_id', user.id);  // Add user filter
    
    if (error) throw error;
  }
  
  static async unsuspendFlashcards(ids: string[]): Promise<void> {
    const user = await this.getAuthenticatedUser();
    
    const { error } = await supabase
      .from('flashcards')
      .update({ status: 'new' })
      .in('id', ids)
      .eq('user_id', user.id);  // Add user filter
    
    if (error) throw error;
  }
  
  // ======================
  // Search and Analytics
  // ======================
  
  static async searchFlashcards(query: string, deckId?: string): Promise<Flashcard[]> {
    const user = await this.getAuthenticatedUser();
    
    let supabaseQuery = supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id)  // Add user filter
      .or(`front_content.ilike.%${query}%,back_content.ilike.%${query}%,cloze_content.ilike.%${query}%`);
    
    if (deckId) {
      supabaseQuery = supabaseQuery.eq('deck_id', deckId);
    }
    
    const { data, error } = await supabaseQuery;
    if (error) throw error;
    return data || [];
  }
  
  static async getStudyAnalytics(days: number = 30): Promise<{
    totalReviews: number;
    accuracy: number;
    streak: number;
    dailyStats: Array<{
      date: string;
      reviews: number;
      accuracy: number;
    }>;
  }> {
    const user = await this.getAuthenticatedUser();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data: reviews, error } = await supabase
      .from('flashcard_reviews')
      .select('reviewed_at, quality')
      .eq('user_id', user.id)  // Add user filter
      .gte('reviewed_at', startDate.toISOString())
      .order('reviewed_at', { ascending: true });
    
    if (error) throw error;
    
    const totalReviews = reviews?.length || 0;
    const correctReviews = reviews?.filter(r => r.quality >= 3).length || 0;
    const accuracy = totalReviews > 0 ? (correctReviews / totalReviews) * 100 : 0;
    
    // Calculate daily stats
    const dailyStats: { [key: string]: { reviews: number; correct: number } } = {};
    
    reviews?.forEach(review => {
      const date = new Date(review.reviewed_at).toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { reviews: 0, correct: 0 };
      }
      dailyStats[date].reviews++;
      if (review.quality >= 3) {
        dailyStats[date].correct++;
      }
    });
    
    const dailyArray = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      reviews: stats.reviews,
      accuracy: stats.reviews > 0 ? (stats.correct / stats.reviews) * 100 : 0
    }));
    
    // Calculate streak (consecutive days with reviews)
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();
    
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (dailyStats[dateStr]?.reviews > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return {
      totalReviews,
      accuracy,
      streak,
      dailyStats: dailyArray
    };
  }

  // Keep existing spaced repetition methods unchanged
  static calculateNextReview(
    quality: ReviewQuality,
    easeFactor: number,
    intervalDays: number,
    repetitions: number
  ): {
    newEaseFactor: number;
    newInterval: number;
    newRepetitions: number;
    nextReviewDate: Date;
  } {
    let newEF = easeFactor;
    let newInterval = intervalDays;
    let newRepetitions = repetitions;
    
    if (quality >= 3) {
      // Correct response
      newRepetitions = repetitions + 1;
      
      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(intervalDays * easeFactor);
      }
      
      // Update ease factor
      newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      newEF = Math.max(newEF, 1.3);
    } else {
      // Incorrect response
      newRepetitions = 0;
      newInterval = 1;
      // Don't change ease factor for incorrect responses
    }
    
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
    
    return {
      newEaseFactor: Math.round(newEF * 100) / 100, // Round to 2 decimal places
      newInterval,
      newRepetitions,
      nextReviewDate
    };
  }
  
  static determineNewStatus(repetitions: number, quality: ReviewQuality): string {
    if (quality < 3) {
      return 'learning';
    }
    
    if (repetitions < 2) {
      return 'learning';
    } else if (repetitions < 5) {
      return 'review';
    } else {
      return 'mature';
    }
  }
}