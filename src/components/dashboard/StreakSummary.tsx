// src/components/dashboard/StreakSummary.tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useDailyActivity } from '@/lib/hooks/useDailyActivity';

export default function StreakSummary() {
  const { currentStreak, weeklyActivity, loading } = useDailyActivity();
  
  // Calculate today's note count from weekly activity
  const todayCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = weeklyActivity.find(day => day.date.split('T')[0] === today);
    return todayActivity?.notes_count || 0;
  }, [weeklyActivity]);
  
  // Determine message and status based on activity
  const { message, status } = useMemo(() => {
    if (todayCount > 0) {
      return {
        message: `You've created ${todayCount} note${todayCount !== 1 ? 's' : ''} today. Current streak: ${currentStreak} day${currentStreak !== 1 ? 's' : ''}!`,
        status: 'success'
      };
    } else if (currentStreak > 0) {
      return {
        message: `Keep your ${currentStreak}-day streak going! Create a note today.`,
        status: 'warning'
      };
    } else {
      return {
        message: 'Start your learning streak by creating a note today!',
        status: 'info'
      };
    }
  }, [currentStreak, todayCount]);
  
  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 rounded dark:bg-gray-700 w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded dark:bg-gray-700 w-1/2"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`p-4 rounded-lg shadow ${
      status === 'success' 
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800' 
        : status === 'warning'
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800'
          : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800'
    }`}>
      <div className="flex items-center">
        <div className="mr-3">
          {status === 'success' ? (
            <svg className="w-10 h-10 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : status === 'warning' ? (
            <svg className="w-10 h-10 text-yellow-500 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </div>
        <div>
          <h3 className={`font-medium ${
            status === 'success' 
              ? 'text-green-800 dark:text-green-200' 
              : status === 'warning'
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-blue-800 dark:text-blue-200'
          }`}>Learning Streak</h3>
          <p className={
            status === 'success' 
              ? 'text-green-700 dark:text-green-300' 
              : status === 'warning'
                ? 'text-yellow-700 dark:text-yellow-300'
                : 'text-blue-700 dark:text-blue-300'
          }>
            {message}
          </p>
        </div>
      </div>
      <div className="mt-3 text-right">
        <Link 
          href="/learning-tracker" 
          className={`text-sm font-medium ${
            status === 'success' 
              ? 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300' 
              : status === 'warning'
                ? 'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300'
                : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
          }`}
        >
          View Learning Tracker →
        </Link>
      </div>
    </div>
  );
}