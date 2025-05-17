// src/app/learning-tracker/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import { useDailyActivity } from '@/lib/hooks/useDailyActivity';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import StreakDisplay from '@/components/activity-tracker/StreakDisplay';
import ActivityCalendar from '@/components/activity-tracker/ActivityCalendar';
import WeeklyActivityChart from '@/components/activity-tracker/WeeklyActivityChart';
import Spinner from '@/components/ui/Spinner';

export default function LearningTrackerPage() {
  const { user, loading: authLoading } = useAuth();
  const { 
    currentStreak, 
    weeklyActivity, 
    monthlyActivity, 
    loading: activityLoading,
    refreshActivity 
  } = useDailyActivity();
  
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  const loading = authLoading || activityLoading;

  // Get today's note count from weekly activity
  const todayCount = (() => {
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = weeklyActivity.find(day => day.date.split('T')[0] === today);
    return todayActivity?.notes_count || 0;
  })();

  // Determine streak message
  const getStreakMessage = () => {
    if (currentStreak === 0) {
      return "You haven't created any notes recently. Start your streak today!";
    } else if (todayCount === 0) {
      return `You have a ${currentStreak}-day streak going. Don't break the chain - create a note today!`;
    } else {
      return `Great job! You've maintained your learning streak for ${currentStreak} day${currentStreak !== 1 ? 's' : ''}.`;
    }
  };

  if (loading) {
    return (
      <PageContainer title="Learning Tracker">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Learning Tracker">
      <div className="space-y-6">
        {/* Introduction */}
        <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="text-xl font-medium mb-2">Daily Learning Habit</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Track your consistency and build a daily learning habit. Each day you create a note adds to your streak.
          </p>
        </div>
        
        {/* Streak Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Streak Display */}
          <div className="md:col-span-1">
            <StreakDisplay />
          </div>
          
          {/* Message and Action */}
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800 md:col-span-2">
            <h3 className="text-lg font-medium mb-2">Your Progress</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {getStreakMessage()}
            </p>
            
            {todayCount === 0 && (
              <div className="mt-2">
                <Link href="/notes/new">
                  <Button>Create Today's Note</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
        
        {/* Weekly Activity Chart */}
        <WeeklyActivityChart activity={weeklyActivity} />
        
        {/* Monthly Calendar */}
        <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
          <ActivityCalendar activity={monthlyActivity} />
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <h3 className="text-lg font-medium mb-1">Current Streak</h3>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {currentStreak} <span className="text-base font-normal text-gray-500 dark:text-gray-400">days</span>
            </p>
          </div>
          
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <h3 className="text-lg font-medium mb-1">Notes Today</h3>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {todayCount} <span className="text-base font-normal text-gray-500 dark:text-gray-400">notes</span>
            </p>
          </div>
          
          <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
            <h3 className="text-lg font-medium mb-1">This Week</h3>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {weeklyActivity.reduce((total, day) => total + day.notes_count, 0)}
              <span className="text-base font-normal text-gray-500 dark:text-gray-400"> notes</span>
            </p>
          </div>
        </div>
        
        {/* Tips */}
        <div className="p-6 bg-primary-50 rounded-lg dark:bg-gray-800 border border-primary-100 dark:border-gray-700">
          <h3 className="mb-4 text-lg font-medium">Consistency Tips</h3>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Create at least one note per day to build your streak</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Set a daily reminder to ensure you don't break your streak</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Quality matters, but consistency is key to long-term learning</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Even a quick clinical pearl or observation counts toward your streak</span>
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}