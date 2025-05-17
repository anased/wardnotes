// src/components/activity-tracker/ActivityCalendar.tsx
'use client';

import React, { useMemo } from 'react';
import { DailyActivity } from '@/lib/supabase/types';

interface ActivityCalendarProps {
  activity: DailyActivity[];
}

export default function ActivityCalendar({ activity }: ActivityCalendarProps) {
  // Generate calendar data
  const calendarData = useMemo(() => {
    // Get current month
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    // Get first day of the month and determine the starting day of week
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Get number of days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Create activity map for quick lookup
    const activityMap = new Map<string, DailyActivity>();
    activity.forEach(day => {
      const date = new Date(day.date);
      // Only include dates from current month
      if (date.getMonth() === month && date.getFullYear() === year) {
        const dateKey = date.getDate().toString();
        activityMap.set(dateKey, day);
      }
    });
    
    // Generate weeks array with days
    const weeks = [];
    let days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      const dateKey = i.toString();
      const dayActivity = activityMap.get(dateKey);
      days.push({
        date: i,
        hasActivity: !!dayActivity,
        notesCount: dayActivity?.notes_count || 0
      });
      
      // Start a new week
      if ((i + startingDayOfWeek) % 7 === 0) {
        weeks.push([...days]);
        days = [];
      }
    }
    
    // Add remaining days to the last week
    if (days.length > 0) {
      // Fill the rest of the week with null
      while (days.length < 7) {
        days.push(null);
      }
      weeks.push([...days]);
    }
    
    return weeks;
  }, [activity]);
  
  // Get month name
  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="activity-calendar">
      <h3 className="text-lg font-medium mb-4">{monthName} Activity</h3>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 gap-1">
        {calendarData.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((day, dayIndex) => (
              <div 
                key={dayIndex} 
                className={`aspect-square flex items-center justify-center rounded-md ${
                  day === null 
                    ? 'bg-transparent' 
                    : day.hasActivity 
                      ? getActivityColorClass(day.notesCount)
                      : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                {day !== null && (
                  <span className={`text-sm ${
                    day.hasActivity 
                      ? 'text-gray-900 dark:text-white font-medium' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {day.date}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper function to get the activity color based on note count
function getActivityColorClass(count: number): string {
  if (count === 0) return 'bg-gray-100 dark:bg-gray-800';
  if (count === 1) return 'bg-primary-100 dark:bg-primary-900';
  if (count === 2) return 'bg-primary-200 dark:bg-primary-800';
  if (count === 3) return 'bg-primary-300 dark:bg-primary-700';
  if (count === 4) return 'bg-primary-400 dark:bg-primary-600';
  return 'bg-primary-500 dark:bg-primary-500';
}