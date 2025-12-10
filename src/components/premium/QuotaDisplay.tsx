'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface QuotaInfo {
  flashcard_generation: {
    used: number;
    limit: number | null;
    remaining: number | null;
    isUnlimited: boolean;
  };
  note_improvement: {
    used: number;
    limit: number | null;
    remaining: number | null;
    isUnlimited: boolean;
  };
  period: {
    start: string;
    end: string;
    daysRemaining: number;
  };
}

interface QuotaDisplayProps {
  className?: string;
  showUpgradeLink?: boolean;
}

export default function QuotaDisplay({ className = '', showUpgradeLink = true }: QuotaDisplayProps) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuota();
  }, []);

  async function fetchQuota() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/user/quota', {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quota');
      }

      const data = await response.json();
      setQuota(data);
    } catch (err) {
      console.error('Error fetching quota:', err);
      setError(err instanceof Error ? err.message : 'Failed to load quota');
    } finally {
      setLoading(false);
    }
  }

  // Don't show anything for premium users (unlimited)
  if (quota?.flashcard_generation.isUnlimited && quota?.note_improvement.isUnlimited) {
    return null;
  }

  if (loading) {
    return (
      <div className={`bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-3/4 mb-2" />
          <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !quota) {
    return null; // Silently fail - quota display is non-critical
  }

  return (
    <div className={`bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          Your Free Plan Usage This Month
        </h3>
        {showUpgradeLink && (
          <Link
            href="/settings/subscription"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Upgrade →
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <QuotaItem
          label="AI Flashcard Generations"
          used={quota.flashcard_generation.used}
          limit={quota.flashcard_generation.limit}
          isUnlimited={quota.flashcard_generation.isUnlimited}
        />
        <QuotaItem
          label="AI Note Improvements"
          used={quota.note_improvement.used}
          limit={quota.note_improvement.limit}
          isUnlimited={quota.note_improvement.isUnlimited}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Resets in {quota.period.daysRemaining} {quota.period.daysRemaining === 1 ? 'day' : 'days'}
        </p>
      </div>
    </div>
  );
}

interface QuotaItemProps {
  label: string;
  used: number;
  limit: number | null;
  isUnlimited: boolean;
}

function QuotaItem({ label, used, limit, isUnlimited }: QuotaItemProps) {
  if (isUnlimited) {
    return (
      <div>
        <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-1">
          <span>{label}</span>
          <span className="font-medium text-green-600 dark:text-green-400">Unlimited</span>
        </div>
      </div>
    );
  }

  const percentage = limit ? (used / limit) * 100 : 0;
  const remaining = limit ? limit - used : 0;

  return (
    <div>
      <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-1.5">
        <span>{label}</span>
        <span className="font-medium">
          {used} / {limit ?? 0} used
        </span>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            percentage >= 100
              ? 'bg-red-500'
              : percentage >= 80
              ? 'bg-yellow-500'
              : 'bg-green-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {remaining === 0 && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">
          Quota exhausted. Upgrade for unlimited access.
        </p>
      )}
      {remaining > 0 && remaining <= 1 && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1.5">
          {remaining} use remaining
        </p>
      )}
    </div>
  );
}
