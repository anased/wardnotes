// Analytics event tracking types

export interface AnalyticsConfig {
  apiKey: string;
  apiHost?: string;
  disabled?: boolean;
}

export interface UserProperties {
  email?: string;
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid' | 'free' | 'premium' | 'trial';
  signup_date?: string;
  subscription_plan?: string;
}

// Event names as string literals for type safety
export type AnalyticsEvent =
  // Authentication events
  | 'signup_started'
  | 'signup_completed'
  | 'signin_completed'
  
  // Onboarding events
  | 'onboarding_completed'
  
  // Core feature events
  | 'note_created'
  | 'tag_added'
  | 'search_used'
  
  // AI feature events
  | 'ai_note_improve_started'
  | 'ai_note_improve_completed'
  | 'ai_flashcard_generate_started'
  | 'ai_flashcard_generate_completed'
  
  // Subscription events
  | 'paywall_viewed'
  | 'trial_started'
  | 'checkout_completed'
  | 'subscription_cancelled';

// Base properties included in all events
export interface BaseEventProperties {
  user_id?: string;
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid' | 'free' | 'premium' | 'trial';
  timestamp?: string;
}

// Specific event properties
export interface NoteCreatedProperties extends BaseEventProperties {
  note_category?: string;
  tag_count: number;
}

export interface TagAddedProperties extends BaseEventProperties {
  tag_name: string;
  note_id: string;
}

export interface SearchUsedProperties extends BaseEventProperties {
  search_query: string;
  results_count: number;
}

export interface AIImproveProperties extends BaseEventProperties {
  note_id: string;
  improvement_type?: string;
}

export interface FlashcardGenerateProperties extends BaseEventProperties {
  note_id: string;
  flashcard_count: number;
}

export interface PaywallProperties extends BaseEventProperties {
  feature_blocked: string;
  upgrade_context: string;
}

export interface SubscriptionProperties extends BaseEventProperties {
  plan_type: 'monthly' | 'annual';
  amount?: number;
}

// Union type for all event properties
export type EventProperties = 
  | BaseEventProperties
  | NoteCreatedProperties
  | TagAddedProperties
  | SearchUsedProperties
  | AIImproveProperties
  | FlashcardGenerateProperties
  | PaywallProperties
  | SubscriptionProperties;

export interface Analytics {
  init: (config: AnalyticsConfig) => void;
  identify: (userId: string, properties?: UserProperties) => void;
  track: (event: AnalyticsEvent, properties?: EventProperties) => void;
  isInitialized: () => boolean;
}