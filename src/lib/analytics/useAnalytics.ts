'use client';

import { useCallback } from 'react';
import posthog from 'posthog-js';
import { 
  AnalyticsConfig, 
  AnalyticsEvent, 
  EventProperties, 
  UserProperties,
  Analytics 
} from '@/types/analytics';

class AnalyticsService implements Analytics {
  private initialized = false;
  private config: AnalyticsConfig | null = null;

  init(config: AnalyticsConfig): void {
    // Only initialize in browser environment
    if (typeof window === 'undefined') {
      console.log('Analytics: Skipping initialization on server');
      return;
    }

    // Skip if disabled or already initialized
    if (config.disabled || this.initialized) {
      console.log('Analytics: Initialization skipped (disabled or already initialized)');
      return;
    }

    try {
      posthog.init(config.apiKey, {
        api_host: config.apiHost || 'https://us.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('Analytics: PostHog loaded successfully');
          }
        }
      });

      this.initialized = true;
      this.config = config;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Analytics: Initialized successfully');
      }
    } catch (error) {
      console.error('Analytics: Failed to initialize PostHog', error);
    }
  }

  identify(userId: string, properties?: UserProperties): void {
    if (!this.isInitialized()) {
      console.warn('Analytics: Cannot identify user - not initialized');
      return;
    }

    try {
      posthog.identify(userId, {
        email: properties?.email,
        subscription_status: properties?.subscription_status || 'free',
        signup_date: properties?.signup_date,
        subscription_plan: properties?.subscription_plan
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('Analytics: User identified', { userId, properties });
      }
    } catch (error) {
      console.error('Analytics: Failed to identify user', error);
    }
  }

  track(event: AnalyticsEvent, properties?: EventProperties): void {
    if (!this.isInitialized()) {
      console.warn('Analytics: Cannot track event - not initialized');
      return;
    }

    try {
      const eventProperties = {
        ...properties,
        timestamp: new Date().toISOString()
      };

      posthog.capture(event, eventProperties);

      if (process.env.NODE_ENV === 'development') {
        console.log('Analytics: Event tracked', { event, properties: eventProperties });
      }
    } catch (error) {
      console.error('Analytics: Failed to track event', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized && typeof window !== 'undefined';
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

// React hook for analytics
export function useAnalytics() {
  const init = useCallback((config: AnalyticsConfig) => {
    analyticsService.init(config);
  }, []);

  const identify = useCallback((userId: string, properties?: UserProperties) => {
    analyticsService.identify(userId, properties);
  }, []);

  const track = useCallback((event: AnalyticsEvent, properties?: EventProperties) => {
    analyticsService.track(event, properties);
  }, []);

  const isInitialized = useCallback(() => {
    return analyticsService.isInitialized();
  }, []);

  return {
    init,
    identify,
    track,
    isInitialized
  };
}

// Export the service for direct use if needed
export { analyticsService as analytics };