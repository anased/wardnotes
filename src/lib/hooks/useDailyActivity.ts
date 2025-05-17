// src/lib/hooks/useDailyActivity.ts
import { useState, useEffect, useCallback } from 'react';
import { 
  getCurrentStreak, 
  getWeeklyActivity, 
  getMonthlyActivity,
  DailyActivity
} from '../supabase/client';

export function useDailyActivity() {
  const [currentStreak, setCurrentStreak] = useState(0);
  const [weeklyActivity, setWeeklyActivity] = useState<DailyActivity[]>([]);
  const [monthlyActivity, setMonthlyActivity] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch streak
      const streak = await getCurrentStreak();
      setCurrentStreak(streak);
      
      // Fetch weekly activity
      const weekData = await getWeeklyActivity();
      setWeeklyActivity(weekData);
      
      // Fetch monthly activity
      const monthData = await getMonthlyActivity();
      setMonthlyActivity(monthData);
      
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching activity data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    currentStreak,
    weeklyActivity,
    monthlyActivity,
    loading,
    error,
    refreshActivity: fetchActivity
  };
}