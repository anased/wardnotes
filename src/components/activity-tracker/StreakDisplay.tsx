'use client';

import React from 'react';
import { useDailyActivity } from '@/lib/hooks/useDailyActivity';

export default function StreakDisplay() {
  const { currentStreak, loading } = useDailyActivity();
  
  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="animate-pulse h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="flex items-center">
        <div className="mr-3">
          <svg className="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Current Streak</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>
    </div>
  );
}