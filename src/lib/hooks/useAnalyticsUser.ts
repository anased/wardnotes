'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useSubscription } from './useSubscription';
import { useAnalytics } from '../analytics/useAnalytics';

export function useAnalyticsUser() {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const { identify, isInitialized } = useAnalytics();

  useEffect(() => {
    // Only proceed if analytics is initialized and user is signed in
    if (!isInitialized() || !user) {
      return;
    }

    // Get subscription status for user properties
    const subscriptionStatus = subscription?.subscription_status === 'active' 
      ? 'premium' 
      : subscription?.subscription_status || 'free';

    // Identify the user with PostHog
    identify(user.id, {
      email: user.email,
      subscription_status: subscriptionStatus,
      signup_date: user.created_at,
      subscription_plan: subscription?.subscription_plan || 'free'
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Analytics: User identified', {
        userId: user.id,
        email: user.email,
        subscriptionStatus,
        subscriptionPlan: subscription?.subscription_plan
      });
    }
  }, [user, subscription, identify, isInitialized]);

  return {
    user,
    subscription,
    isAnalyticsReady: isInitialized() && !!user
  };
}