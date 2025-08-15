'use client';

import { useEffect } from 'react';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useAnalyticsUser } from '@/lib/hooks/useAnalyticsUser';

export function AnalyticsProvider() {
  const { init } = useAnalytics();
  
  // This hook handles user identification automatically
  useAnalyticsUser();

  useEffect(() => {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    
    if (!posthogKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Analytics: PostHog key not found, skipping initialization');
      }
      return;
    }

    // Initialize PostHog
    init({
      apiKey: posthogKey,
      apiHost: 'https://us.posthog.com',
      disabled: process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'true'
    });
  }, [init]);

  return null; // This component doesn't render anything
}