// src/lib/hooks/useDashboardStats.ts
import { useCallback, useEffect, useState } from 'react';
import { getActivityForDateRange, getCurrentStreak } from '../supabase/client';
import { FlashcardService } from '@/services/flashcard';
import { dateKey, startOfWeek } from '../utils/dashboard';

export interface DashboardStats {
  /** Flashcards due now; null when it could not be loaded. */
  dueCount: number | null;
  currentStreak: number;
  /** YYYY-MM-DD keys of this week's days (Mon–Sun) with at least one note. */
  activeDates: string[];
  loading: boolean;
}

/**
 * Loads the numbers behind the dashboard's summary cards. Each source fails
 * on its own, so a flashcard error doesn't hide the streak and vice versa.
 */
export function useDashboardStats(enabled = true): DashboardStats {
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const monday = startOfWeek(now);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const [due, streak, week] = await Promise.allSettled([
      FlashcardService.getDueCount(),
      getCurrentStreak(),
      getActivityForDateRange(dateKey(monday), dateKey(sunday)),
    ]);

    setDueCount(due.status === 'fulfilled' ? due.value : null);
    setCurrentStreak(streak.status === 'fulfilled' ? streak.value : 0);
    setActiveDates(
      week.status === 'fulfilled'
        ? week.value.filter((d) => d.notes_count > 0).map((d) => d.date.split('T')[0])
        : []
    );
    [due, streak, week].forEach((r) => {
      if (r.status === 'rejected') console.error('Error loading dashboard stats:', r.reason);
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { dueCount, currentStreak, activeDates, loading };
}
