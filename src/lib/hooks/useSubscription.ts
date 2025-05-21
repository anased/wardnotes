// src/lib/hooks/useSubscription.ts
import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { useNotification } from '@/lib/context/NotificationContext';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '@/lib/supabase/types';

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { showNotification } = useNotification();

  // Computed property to check if the user has premium access
  const isPremium = subscription?.subscription_status === 'active' && 
                   subscription?.subscription_plan === 'premium';

  // Fetch the user's subscription on mount
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
    
    fetchSubscription();
    
    // Also set up a subscription to auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchSubscription();
      }
    });
    
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

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

  return {
    subscription,
    isPremium,
    loading,
    error,
    redirectToCheckout,
    manageBilling
  };
}