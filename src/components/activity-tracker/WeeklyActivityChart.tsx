// src/components/activity-tracker/WeeklyActivityChart.tsx
'use client';

import React, { useMemo } from 'react';
import { DailyActivity } from '@/lib/supabase/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WeeklyActivityChartProps {
  activity: DailyActivity[];
}

export default function WeeklyActivityChart({ activity }: WeeklyActivityChartProps) {
  // Process data for the chart
  const chartData = useMemo(() => {
    // Get dates for the current week
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Create an array of dates for the week starting from Sunday
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOfWeek + i);
      return date;
    });
    
    // Initialize data with all days of the week
    const weekData = weekDates.map(date => {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        day: dayName,
        date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        count: 0,
      };
    });
    
    // Create activity map for quick lookup
    const activityMap = new Map<string, DailyActivity>();
    activity.forEach(day => {
      const dateKey = day.date.split('T')[0]; // Format as YYYY-MM-DD
      activityMap.set(dateKey, day);
    });
    
    // Update counts for each day
    weekData.forEach((day, index) => {
      const dayActivity = activityMap.get(day.date);
      if (dayActivity) {
        day.count = dayActivity.notes_count;
      }
    });
    
    return weekData;
  }, [activity]);

  if (activity.length === 0) {
    return (
      <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
        <h3 className="text-lg font-medium mb-4">Weekly Activity</h3>
        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
          No activity data available.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
      <h3 className="text-lg font-medium mb-4">Weekly Activity</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              }}
              formatter={(value: number, name: string) => [`${value} note${value !== 1 ? 's' : ''}`, 'Count']}
              labelFormatter={(label: string) => `${label}`}
            />
            <Bar
              dataKey="count"
              name="Notes"
              fill="#0ea5e9" // primary-500
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}