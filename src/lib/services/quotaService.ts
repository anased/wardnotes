/**
 * Quota Service
 *
 * Manages usage quotas for AI-powered features (flashcard generation, note improvement)
 * Implements freemium pricing model with monthly usage limits for free users
 */

import { createClient } from '@supabase/supabase-js';
import type { QuotaCheckResult, QuotaFeatureType, UsageQuota } from '@/lib/supabase/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Check and increment quota for a specific feature
 * Returns whether the action is allowed and updates the usage counter
 *
 * @param userId - The user's UUID
 * @param featureType - Type of feature ('flashcard_generation' | 'note_improvement')
 * @returns QuotaCheckResult with allowed status and quota info
 */
export async function checkAndIncrementQuota(
  userId: string,
  featureType: QuotaFeatureType
): Promise<QuotaCheckResult> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data, error } = await supabase.rpc('check_and_increment_usage', {
      p_user_id: userId,
      p_feature_type: featureType
    });

    if (error) {
      console.error('Quota check error:', error);
      throw new Error('Failed to check usage quota');
    }

    return data as QuotaCheckResult;
  } catch (error) {
    console.error('Error in checkAndIncrementQuota:', error);
    throw error;
  }
}

/**
 * Get current quota information for a user
 * Does not increment usage - only retrieves current state
 *
 * @param userId - The user's UUID
 * @returns Current quota information with usage and limits
 */
export async function getUserQuota(userId: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Try to get existing quota for current period
    const { data, error } = await supabase
      .from('usage_quotas')
      .select('*')
      .eq('user_id', userId)
      .lte('period_start', new Date().toISOString())
      .gt('period_end', new Date().toISOString())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Get quota error:', error);
      throw new Error('Failed to get usage quota');
    }

    // If no quota exists, initialize it
    if (!data) {
      const { data: newQuota, error: initError } = await supabase.rpc(
        'initialize_user_quota',
        { p_user_id: userId }
      );

      if (initError) {
        console.error('Initialize quota error:', initError);
        throw new Error('Failed to initialize quota');
      }

      return newQuota as UsageQuota;
    }

    return data as UsageQuota;
  } catch (error) {
    console.error('Error in getUserQuota:', error);
    throw error;
  }
}

/**
 * Get formatted quota information for display
 * Includes calculated remaining counts and formatted dates
 *
 * @param userId - The user's UUID
 * @returns Formatted quota information
 */
export async function getFormattedQuota(userId: string) {
  const quota = await getUserQuota(userId);

  return {
    flashcardGeneration: {
      used: quota.flashcard_generations_used,
      limit: quota.flashcard_generations_limit,
      remaining:
        quota.flashcard_generations_limit === null
          ? null
          : quota.flashcard_generations_limit - quota.flashcard_generations_used,
      isUnlimited: quota.flashcard_generations_limit === null,
    },
    noteImprovement: {
      used: quota.note_improvements_used,
      limit: quota.note_improvements_limit,
      remaining:
        quota.note_improvements_limit === null
          ? null
          : quota.note_improvements_limit - quota.note_improvements_used,
      isUnlimited: quota.note_improvements_limit === null,
    },
    period: {
      start: new Date(quota.period_start),
      end: new Date(quota.period_end),
      daysRemaining: Math.ceil(
        (new Date(quota.period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    },
  };
}

/**
 * Check if user has reached their quota for a specific feature
 * Does not increment usage - only checks current state
 *
 * @param userId - The user's UUID
 * @param featureType - Type of feature to check
 * @returns Boolean indicating if user can use the feature
 */
export async function canUseFeature(
  userId: string,
  featureType: QuotaFeatureType
): Promise<boolean> {
  try {
    const quota = await getUserQuota(userId);

    if (featureType === 'flashcard_generation') {
      // Null limit means unlimited (premium user)
      if (quota.flashcard_generations_limit === null) {
        return true;
      }
      return quota.flashcard_generations_used < quota.flashcard_generations_limit;
    } else if (featureType === 'note_improvement') {
      if (quota.note_improvements_limit === null) {
        return true;
      }
      return quota.note_improvements_used < quota.note_improvements_limit;
    }

    return false;
  } catch (error) {
    console.error('Error in canUseFeature:', error);
    // Fail open - allow usage if quota check fails
    return true;
  }
}

/**
 * Log API usage for analytics and cost tracking
 * Optional function for detailed tracking of AI API costs
 *
 * @param userId - The user's UUID
 * @param featureType - Type of feature used
 * @param apiCost - Cost in USD
 * @param tokensUsed - Number of tokens consumed (optional)
 * @param success - Whether the API call succeeded
 * @param errorMessage - Error message if failed (optional)
 */
export async function logApiUsage(
  userId: string,
  featureType: QuotaFeatureType,
  apiCost: number,
  tokensUsed?: number,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { error } = await supabase.from('api_usage_logs').insert({
      user_id: userId,
      feature_type: featureType,
      api_cost: apiCost,
      tokens_used: tokensUsed || null,
      success,
      error_message: errorMessage || null,
    });

    if (error) {
      console.error('Log API usage error:', error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  } catch (error) {
    console.error('Error in logApiUsage:', error);
    // Silently fail - logging is non-critical
  }
}

/**
 * Initialize quota for new user
 * Called automatically via trigger, but can be called manually if needed
 *
 * @param userId - The user's UUID
 */
export async function initializeUserQuota(userId: string): Promise<UsageQuota> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data, error } = await supabase.rpc('initialize_user_quota', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Initialize quota error:', error);
      throw new Error('Failed to initialize user quota');
    }

    return data as UsageQuota;
  } catch (error) {
    console.error('Error in initializeUserQuota:', error);
    throw error;
  }
}

/**
 * Get usage statistics for admin/analytics purposes
 * Returns aggregated quota usage across all users
 *
 * @returns Aggregated usage statistics
 */
export async function getUsageStatistics() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data: quotas, error } = await supabase
      .from('usage_quotas')
      .select('*')
      .lte('period_start', new Date().toISOString())
      .gt('period_end', new Date().toISOString());

    if (error) {
      console.error('Get usage statistics error:', error);
      throw new Error('Failed to get usage statistics');
    }

    if (!quotas) {
      return {
        totalUsers: 0,
        freeUsers: 0,
        premiumUsers: 0,
        flashcardGenerations: { totalUsed: 0, averagePerUser: 0, freeUsersAtLimit: 0 },
        noteImprovements: { totalUsed: 0, averagePerUser: 0, freeUsersAtLimit: 0 },
      };
    }

    // Calculate statistics
    const freeUsers = quotas.filter((q: UsageQuota) => q.flashcard_generations_limit !== null);
    const premiumUsers = quotas.filter((q: UsageQuota) => q.flashcard_generations_limit === null);

    return {
      totalUsers: quotas.length,
      freeUsers: freeUsers.length,
      premiumUsers: premiumUsers.length,
      flashcardGenerations: {
        totalUsed: quotas.reduce((sum: number, q: UsageQuota) => sum + q.flashcard_generations_used, 0),
        averagePerUser: quotas.length > 0
          ? quotas.reduce((sum: number, q: UsageQuota) => sum + q.flashcard_generations_used, 0) / quotas.length
          : 0,
        freeUsersAtLimit: freeUsers.filter(
          (q: UsageQuota) => q.flashcard_generations_used >= (q.flashcard_generations_limit || 0)
        ).length,
      },
      noteImprovements: {
        totalUsed: quotas.reduce((sum: number, q: UsageQuota) => sum + q.note_improvements_used, 0),
        averagePerUser: quotas.length > 0
          ? quotas.reduce((sum: number, q: UsageQuota) => sum + q.note_improvements_used, 0) / quotas.length
          : 0,
        freeUsersAtLimit: freeUsers.filter(
          (q: UsageQuota) => q.note_improvements_used >= (q.note_improvements_limit || 0)
        ).length,
      },
    };
  } catch (error) {
    console.error('Error in getUsageStatistics:', error);
    throw error;
  }
}
