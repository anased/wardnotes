// src/components/premium/InlineQuotaIndicator.tsx
import React from 'react';
import { useQuota } from '@/lib/hooks/useQuota';
import { useSubscription } from '@/lib/hooks/useSubscription';
import type { QuotaFeatureType } from '@/lib/supabase/types';

interface InlineQuotaIndicatorProps {
  featureType: QuotaFeatureType;
  className?: string;
}

/**
 * Inline quota indicator component
 *
 * Displays remaining quota uses next to buttons (e.g., "2/3 left")
 * with color coding based on remaining count.
 *
 * - Green: More than 1 use remaining
 * - Yellow: Exactly 1 use remaining
 * - Red: 0 uses remaining
 *
 * Auto-hides for premium users (who have unlimited access).
 */
export default function InlineQuotaIndicator({
  featureType,
  className = ''
}: InlineQuotaIndicatorProps) {
  const { isPremium } = useSubscription();
  const { quota, loading, getRemainingUses } = useQuota();

  // Hide for premium users
  if (isPremium) {
    return null;
  }

  // Hide while loading
  if (loading) {
    return null;
  }

  // Hide if quota data is unavailable
  if (!quota) {
    return null;
  }

  const feature = quota[featureType];
  const remaining = getRemainingUses(featureType);

  // Hide if unlimited
  if (feature.isUnlimited || remaining === null) {
    return null;
  }

  // Determine color based on remaining count
  const getColorClass = () => {
    if (remaining === 0) {
      return 'text-red-600 dark:text-red-400';
    } else if (remaining === 1) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
      return 'text-green-600 dark:text-green-400';
    }
  };

  const used = feature.used;
  const limit = feature.limit;

  return (
    <span
      className={`ml-2 text-xs font-medium ${getColorClass()} ${className}`}
      aria-label={`${remaining} of ${limit} uses remaining`}
    >
      ({remaining}/{limit} left)
    </span>
  );
}
