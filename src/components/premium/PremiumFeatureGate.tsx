// src/components/premium/PremiumFeatureGate.tsx
import { ReactNode, useState, cloneElement, isValidElement } from 'react';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useQuota } from '@/lib/hooks/useQuota';
import Button from '../ui/Button';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import type { QuotaFeatureType } from '@/lib/supabase/types';

interface PremiumFeatureGateProps {
  children: ReactNode;
  featureName: string;
  description: string;
  showPremiumBadge?: boolean;
  featureType?: QuotaFeatureType;
  onQuotaExhausted?: () => void;
}

export default function PremiumFeatureGate({
  children,
  featureName,
  description,
  showPremiumBadge = true,
  featureType,
  onQuotaExhausted
}: PremiumFeatureGateProps) {
  const { isPremium, redirectToCheckout, subscription } = useSubscription();
  const { quota, canUseFeature } = useQuota();
  const { track } = useAnalytics();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // 1. Premium users: full access (no changes)
  if (isPremium) {
    return <>{children}</>;
  }

  // 2. Free users with quota available: allow access (NEW)
  if (featureType && quota && canUseFeature(featureType)) {
    return <>{children}</>;
  }

  // Handle upgrade click
  const handleUpgradeClick = async () => {
    setIsRedirecting(true);
    
    // Track trial started when clicking upgrade from paywall
    track('trial_started', {
      plan_type: 'monthly',
      subscription_status: subscription?.subscription_status || 'free'
    });
    
    try {
      await redirectToCheckout();
    } finally {
      setIsRedirecting(false);
    }
  };

  // Function to handle clicks on premium features
  const handlePremiumFeatureClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Track paywall viewed
    track('paywall_viewed', {
      feature_blocked: featureName.toLowerCase().replace(/\s+/g, '_'),
      upgrade_context: 'premium_feature_gate',
      subscription_status: subscription?.subscription_status || 'free'
    });

    // Track quota limit reached if applicable
    if (featureType && quota && !canUseFeature(featureType)) {
      track('quota_limit_reached', {
        feature_type: featureType,
        days_until_reset: quota?.period.daysRemaining,
        subscription_status: 'free'
      });
    }

    // Call onQuotaExhausted callback if provided
    if (onQuotaExhausted) {
      onQuotaExhausted();
    }

    setShowUpgradeModal(true);
  };

  // Clone children and add premium restrictions
  const modifiedChildren = cloneElement(
    isValidElement(children) ? children : <div>{children}</div>,
    {
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handlePremiumFeatureClick(e);
      },
      className: `${(children as any)?.props?.className || ''} cursor-not-allowed opacity-60 pointer-events-none`,
      title: `${featureName} - Premium Feature`
    }
  );

  return (
    <>
      <div 
        className="relative inline-block cursor-pointer"
        onClick={handlePremiumFeatureClick}
      >
        {modifiedChildren}
        
        {/* Premium badge */}
        {showPremiumBadge && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs font-bold text-white bg-primary-500 rounded-full">
            PRO
          </span>
        )}
      </div>
      
      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Upgrade to Premium</h3>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center mb-4">
                <div className="p-2 mr-4 bg-primary-100 rounded-full dark:bg-primary-900">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-semibold">{featureName}</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
                </div>
              </div>

              {/* Quota-specific messaging */}
              {featureType && quota && !canUseFeature(featureType) && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    You've used {quota[featureType].used}/{quota[featureType].limit} free uses this month.
                    Resets in {quota.period.daysRemaining} day{quota.period.daysRemaining !== 1 ? 's' : ''}.
                  </p>
                </div>
              )}

              <p className="mb-4 text-gray-700 dark:text-gray-300">
                Upgrade to WardNotes Premium to unlock this feature and more:
              </p>
              
              <ul className="mb-6 space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Generate Anki flashcards from your notes</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Improve your notes with AI structuring</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support and early access to new features</span>
                </li>
              </ul>
            </div>
            
            <div className="flex flex-col space-y-3">
              <Button
                onClick={handleUpgradeClick}
                isLoading={isRedirecting}
                fullWidth
              >
                Upgrade to Premium
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowUpgradeModal(false)}
                fullWidth
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}