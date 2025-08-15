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
    
    // Temporary production debugging - remove after verification
    console.log('🎯 Analytics: Environment check', {
      hasKey: !!posthogKey,
      keyPrefix: posthogKey?.substring(0, 8),
      nodeEnv: process.env.NODE_ENV,
      enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS
    });
    
    if (!posthogKey) {
      console.log('🎯 Analytics: PostHog key not found, skipping initialization');
      return;
    }

    const isDisabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'true';
    console.log('🎯 Analytics: Initializing PostHog', { disabled: isDisabled });

    // Initialize PostHog
    init({
      apiKey: posthogKey,
      apiHost: 'https://us.posthog.com',
      disabled: isDisabled
    });
  }, [init]);

  return null; // This component doesn't render anything
}