// src/app/settings/subscription/page.tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import { useSubscription } from '@/lib/hooks/useSubscription';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useNotification } from '@/lib/context/NotificationContext';
import { useAnalytics } from '@/lib/analytics/useAnalytics';

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const { subscription, isPremium, loading: subscriptionLoading, redirectToCheckout, manageBilling, refreshSubscription, syncWithStripe } = useSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification } = useNotification();
  const { track } = useAnalytics();
  
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const hasProcessedParams = useRef(false);
  const [hasTrackedPaywallView, setHasTrackedPaywallView] = useState(false);

  // Display prices based on US dollars for now, but this could be dynamic
  const monthlyPrice = '$9.99';
  const annualPrice = '$99.99';
  const annualDiscount = '17%';

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
      return;
    }
    
    // Only process params once to prevent infinite loops
    if (hasProcessedParams.current) {
      return;
    }
    
    // Check for success or canceled params from Stripe redirect
    const success = searchParams?.get('success');
    const canceled = searchParams?.get('canceled');
    const portal = searchParams?.get('portal');
    
    if (success === 'true') {
      hasProcessedParams.current = true;
      showNotification('Your subscription has been activated!', 'success');
      
      // Track checkout completed
      track('checkout_completed', {
        plan_type: selectedPlan,
        subscription_status: 'premium'
      });
      
      // Refresh subscription data to get updated status
      refreshSubscription();
      // Remove query params
      router.replace('/settings/subscription');
    } else if (canceled === 'true') {
      hasProcessedParams.current = true;
      showNotification('Subscription process was canceled.', 'info');
      // Remove query params
      router.replace('/settings/subscription');
    } else if (portal === 'true') {
      hasProcessedParams.current = true;
      // User returned from customer portal, sync subscription data with Stripe
      console.log('User returned from customer portal, syncing subscription data with Stripe');
      syncWithStripe()
        .then((result) => {
          if (result.updated) {
            showNotification('Subscription status updated!', 'success');
          }
        })
        .catch(() => {
          showNotification('Failed to sync subscription status', 'error');
        });
      // Remove query params
      router.replace('/settings/subscription');
    }
  }, [user, authLoading, router, searchParams, showNotification]);

  // Track paywall view for non-premium users
  useEffect(() => {
    const loading = authLoading || subscriptionLoading;
    if (!loading && !isPremium && !hasTrackedPaywallView) {
      track('paywall_viewed', {
        feature_blocked: 'subscription_upgrade',
        upgrade_context: 'subscription_page',
        subscription_status: 'free'
      });
      setHasTrackedPaywallView(true);
    }
  }, [authLoading, subscriptionLoading, isPremium, hasTrackedPaywallView, track]);

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      // Track checkout started (trial_started is close enough)
      track('trial_started', {
        plan_type: selectedPlan,
        subscription_status: 'free'
      });
      
      await redirectToCheckout(selectedPlan === 'annual');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageBilling = async () => {
    setIsProcessing(true);
    try {
      await manageBilling();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefreshSubscription = async () => {
    setIsProcessing(true);
    try {
      await refreshSubscription();
      showNotification('Subscription status refreshed!', 'success');
    } catch (error) {
      showNotification('Failed to refresh subscription status', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncWithStripe = async () => {
    setIsProcessing(true);
    try {
      const result = await syncWithStripe();
      if (result.updated) {
        showNotification('Subscription synced and updated!', 'success');
      } else {
        showNotification('Subscription is already up to date', 'info');
      }
    } catch (error) {
      showNotification('Failed to sync with Stripe', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const loading = authLoading || subscriptionLoading;

  if (loading) {
    return (
      <PageContainer title="Subscription">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Subscription Management">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Current Plan */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Current Plan</h2>
          
          <div className="mb-6">
            <div className="flex items-center">
              <div className="mr-4">
                <div className="p-3 bg-primary-100 rounded-full dark:bg-primary-900">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium">
                  {isPremium ? 'Premium Plan' : 'Free Plan'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {isPremium 
                    ? 'You have access to all premium features' 
                    : 'Basic access with limited features'}
                </p>
                {subscription?.valid_until && isPremium && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                    Renews on {new Date(subscription.valid_until).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {isPremium ? (
            <div>
              <p className="mb-4">
                You're currently on the Premium plan, which includes:
              </p>
              <ul className="mb-6 space-y-2 text-gray-700 dark:text-gray-300">
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>AI-powered flashcard generation for spaced repetition learning</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>AI note improvement for better structure and clarity</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support and early access to new features</span>
                </li>
              </ul>
              <div className="flex space-x-3 flex-wrap">
                <Button
                  onClick={handleManageBilling}
                  isLoading={isProcessing}
                  variant="outline"
                >
                  Manage Billing
                </Button>
                <Button
                  onClick={handleSyncWithStripe}
                  isLoading={isProcessing}
                  variant="outline"
                >
                  Sync with Stripe
                </Button>
                <Button
                  onClick={handleRefreshSubscription}
                  isLoading={isProcessing}
                  variant="outline"
                >
                  Refresh Status
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-4">
                Upgrade to Premium to unlock powerful features:
              </p>
              <ul className="mb-6 space-y-2 text-gray-700 dark:text-gray-300">
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Generate Anki-compatible flashcards from your notes</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Improve your notes with AI-powered structuring</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support and early access to new features</span>
                </li>
              </ul>
            </div>
          )}
        </div>
        
        {/* Plans (only show if not premium) */}
        {!isPremium && (
          <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-semibold">Upgrade to Premium</h2>
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Monthly plan */}
              <div className={`p-6 border rounded-lg ${selectedPlan === 'monthly' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center mb-4">
                  <input
                    type="radio"
                    id="monthly"
                    name="plan"
                    checked={selectedPlan === 'monthly'}
                    onChange={() => setSelectedPlan('monthly')}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="monthly" className="ml-2 text-lg font-medium text-gray-900 dark:text-gray-300">
                    Monthly Plan
                  </label>
                </div>
                
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{monthlyPrice}</span>
                  <span className="text-gray-500 dark:text-gray-400">/month</span>
                </div>
                
                <p className="mb-4 text-gray-600 dark:text-gray-400">
                  Billed monthly. Cancel anytime.
                </p>
                
                <ul className="mb-6 space-y-2 text-gray-600 dark:text-gray-400">
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Flashcard generation</span>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>AI note improvement</span>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>
              
              {/* Annual plan */}
              <div className={`p-6 border rounded-lg ${selectedPlan === 'annual' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center mb-4">
                  <input
                    type="radio"
                    id="annual"
                    name="plan"
                    checked={selectedPlan === 'annual'}
                    onChange={() => setSelectedPlan('annual')}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="annual" className="ml-2 text-lg font-medium text-gray-900 dark:text-gray-300">
                    Annual Plan
                  </label>
                  <span className="ml-2 px-2 py-0.5 text-xs font-semibold text-green-800 bg-green-100 rounded dark:bg-green-900 dark:text-green-300">
                    Save {annualDiscount}
                  </span>
                </div>
                
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{annualPrice}</span>
                  <span className="text-gray-500 dark:text-gray-400">/year</span>
                </div>
                
                <p className="mb-4 text-gray-600 dark:text-gray-400">
                  Billed annually. Best value for serious students.
                </p>
                
                <ul className="mb-6 space-y-2 text-gray-600 dark:text-gray-400">
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Flashcard generation</span>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>AI note improvement</span>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <Button
                onClick={handleUpgrade}
                isLoading={isProcessing}
                fullWidth
              >
                Upgrade Now
              </Button>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Secure payment processing with Stripe. Cancel anytime.
              </p>
            </div>
          </div>
        )}
        
        {/* FAQ Section */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Frequently Asked Questions</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-medium">What's included in the premium plan?</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Premium members get access to AI-powered flashcard generation to create Anki-compatible flashcards from notes,
                and AI note improvement to help structure and enhance medical notes. You'll also be first to access new premium
                features as they're released.
              </p>
            </div>
            
            <div>
              <h3 className="mb-2 text-lg font-medium">Can I cancel my subscription?</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes, you can cancel your subscription at any time. You'll continue to have premium access until the end of your
                current billing period. There are no refunds for partial months or years.
              </p>
            </div>
            
            <div>
              <h3 className="mb-2 text-lg font-medium">How do the premium features work?</h3>
              <p className="text-gray-600 dark:text-gray-400">
                The flashcard generator turns your medical notes into effective Anki-compatible flashcards optimized for
                spaced repetition learning. The note improvement tool helps structure and enhance your notes for better
                readability and organization.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}