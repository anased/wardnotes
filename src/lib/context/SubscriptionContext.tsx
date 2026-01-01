'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
import { useNotification } from './NotificationContext';
import { Subscription } from '../supabase/types';
import { analytics } from '../analytics/useAnalytics';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  subscription: Subscription | null;
  isPremium: boolean;
  loading: boolean;
  error: Error | null;
  redirectToCheckout: (isYearly?: boolean) => Promise<void>;
  manageBilling: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  syncWithStripe: () => Promise<any>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { showNotification } = useNotification();
  const { user } = useAuth();
  const isRefreshing = useRef(false);
  const previousSubscriptionStatus = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  // Computed property to check if the user has premium access
  const isPremium = subscription?.subscription_status === 'active' &&
                   subscription?.subscription_plan === 'premium';

  // Fetch the user's subscription
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the current user's session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // No session, user is not logged in
          setSubscription(null);
          return;
        }

        // Get the user's subscription
        // First check if the subscriptions table exists
        const { error: tableCheckError } = await supabase
          .from('subscriptions')
          .select('count')
          .limit(1)
          .throwOnError();

        if (tableCheckError) {
          console.error('Subscriptions table may not exist:', tableCheckError);
          // Initialize with a default "free" subscription if the table doesn't exist yet
          setSubscription({
            id: '0',
            user_id: session.user.id,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            subscription_status: 'free',
            subscription_plan: 'free',
            valid_until: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          return;
        }

        // Get user's subscription
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle(); // Use maybeSingle instead of single to handle cases where no record exists

        if (error) {
          throw error;
        }

        if (data) {
          setSubscription(data as Subscription);
        } else {
          // No subscription record found, create a default one
          const { data: newSubscription, error: insertError } = await supabase
            .from('subscriptions')
            .insert({
              user_id: session.user.id,
              subscription_status: 'free',
              subscription_plan: 'free',
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating default subscription:', insertError);
            // Fall back to a client-side subscription object
            setSubscription({
              id: '0',
              user_id: session.user.id,
              stripe_customer_id: null,
              stripe_subscription_id: null,
              subscription_status: 'free',
              subscription_plan: 'free',
              valid_until: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } else {
            setSubscription(newSubscription as Subscription);
          }
        }
      } catch (err) {
        console.error('Error fetching subscription:', err);
        setError(err as Error);

        // Set a default subscription to prevent UI errors
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSubscription({
            id: '0',
            user_id: session.user.id,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            subscription_status: 'free',
            subscription_plan: 'free',
            valid_until: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      } finally {
        setLoading(false);
      }
    };

    const currentUserId = user?.id || null;

    // Only fetch if:
    // 1. User ID changed (new user or logout), OR
    // 2. We have no subscription yet (initial load)
    if (currentUserId !== lastUserIdRef.current || (currentUserId && !subscription)) {
      lastUserIdRef.current = currentUserId;
      fetchSubscription();
    }
  }, [user, subscription]);

  // Track subscription cancellations
  useEffect(() => {
    if (subscription && previousSubscriptionStatus.current) {
      // Check if subscription was cancelled
      if (
        previousSubscriptionStatus.current === 'active' &&
        subscription.subscription_status === 'canceled'
      ) {
        // Track subscription cancellation
        analytics.track('subscription_cancelled', {
          subscription_status: 'canceled',
          user_id: subscription.user_id
        });
      }
    }

    // Update the previous status
    if (subscription?.subscription_status) {
      previousSubscriptionStatus.current = subscription.subscription_status;
    }
  }, [subscription]);

  // Function to redirect to Stripe Checkout
  const redirectToCheckout = async (isYearly: boolean = false) => {
    try {
      setLoading(true);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to upgrade');
      }

      // Get the access token
      const token = session.access_token;

      // Call our API to create a checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isYearly }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to checkout
      window.location.href = url;
    } catch (err) {
      console.error('Error redirecting to checkout:', err);
      showNotification(
        err instanceof Error ? err.message : 'Error redirecting to checkout',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  // Function to redirect to the customer portal
  const manageBilling = async () => {
    try {
      setLoading(true);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to manage billing');
      }

      // Get the access token
      const token = session.access_token;

      // Call our API to create a customer portal session
      const response = await fetch('/api/create-customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create customer portal session');
      }

      const { url } = await response.json();

      // Redirect to the customer portal
      window.location.href = url;
    } catch (err) {
      console.error('Error redirecting to customer portal:', err);
      showNotification(
        err instanceof Error ? err.message : 'Error managing billing',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  // Function to manually refresh subscription data
  const refreshSubscription = async () => {
    // Prevent concurrent refreshes
    if (isRefreshing.current) {
      console.log('⏭️ Subscription refresh already in progress, skipping');
      return;
    }

    try {
      isRefreshing.current = true;
      setLoading(true);
      setError(null);

      // Get the current user's session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setSubscription(null);
        return;
      }

      console.log('🔄 Refreshing subscription data for user:', session.user.id);

      // Get user's subscription
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error fetching subscription from database:', error);
        throw error;
      }

      console.log('📋 Fresh subscription data from database:', data);

      if (data) {
        setSubscription(data as Subscription);
        console.log('✅ Subscription state updated:', {
          status: data.subscription_status,
          plan: data.subscription_plan,
          validUntil: data.valid_until
        });
      } else {
        console.log('⚠️ No subscription record found, creating default free subscription');
        setSubscription({
          id: '0',
          user_id: session.user.id,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: 'free',
          subscription_plan: 'free',
          valid_until: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Error refreshing subscription:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
      isRefreshing.current = false;
    }
  };

  // Function to sync subscription status directly with Stripe
  const syncWithStripe = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to sync subscription');
      }

      console.log('🔄 Syncing subscription with Stripe...');

      // Get the access token
      const token = session.access_token;

      // Call our sync API
      const response = await fetch('/api/sync-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync subscription');
      }

      const result = await response.json();
      console.log('✅ Sync result:', result);

      if (result.subscription) {
        setSubscription(result.subscription);
      }

      return result;
    } catch (err) {
      console.error('Error syncing with Stripe:', err);
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    subscription,
    isPremium,
    loading,
    error,
    redirectToCheckout,
    manageBilling,
    refreshSubscription,
    syncWithStripe
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
