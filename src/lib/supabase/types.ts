// src/lib/supabase/types.ts
export type NoteCategory = string; // Changed from enum to string to support custom categories

// Define subscription status and plan types
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid' | 'free';
export type SubscriptionPlan = 'free' | 'premium';

// Topic / trial / link enums (CHECK constraints in add_topics.sql)
export type LinkEndpointType = 'note' | 'trial';
export type LinkRelation = 'answers' | 'supports' | 'cites' | 'critiques' | 'illustrates' | 'related';

/** A row from search_topics(): the topic plus the alias that matched, if any. */
export interface TopicSearchResult {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  /** The alias that matched the query, or null when the name matched. */
  matched_alias: string | null;
  /** 0 exact name, 1 exact alias, 2 name prefix, 3 alias prefix, 4 name contains, 5 alias contains. */
  rank: number;
}

/** One entry of set_note_topics()'s p_links. */
export interface NoteTopicLinkInput {
  topic_id: string;
  section_id: string | null;
  is_primary: boolean;
}

/** One entry of set_trial_topics()'s p_links. */
export interface TrialTopicLinkInput {
  topic_id: string;
  section_id: string | null;
}

// Define the Database schema inline
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: Record<string, unknown>;
          tags: string[];
          category: string; // Changed from enum to string
          status: 'answered' | 'unanswered';
          content_type: 'question' | 'article' | 'trial' | 'review' | 'case' | 'other' | null;
          created_at: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: Record<string, unknown>;
          tags?: string[];
          category: string; // Changed from enum to string
          status?: 'answered' | 'unanswered';
          content_type?: 'question' | 'article' | 'trial' | 'review' | 'case' | 'other' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: Record<string, unknown>;
          tags?: string[];
          category?: string; // Changed from enum to string
          status?: 'answered' | 'unanswered';
          content_type?: 'question' | 'article' | 'trial' | 'review' | 'case' | 'other' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
      };
      topics: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          aliases: string[];
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          aliases?: string[];
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          aliases?: string[];
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      topic_edges: {
        Row: {
          parent_id: string;
          child_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          parent_id: string;
          child_id: string;
          user_id?: string;
          created_at?: string;
        };
        Update: {
          parent_id?: string;
          child_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
      topic_sections: {
        Row: {
          id: string;
          topic_id: string;
          user_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          user_id?: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          topic_id?: string;
          user_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      note_topics: {
        Row: {
          note_id: string;
          topic_id: string;
          user_id: string;
          section_id: string | null;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          note_id: string;
          topic_id: string;
          user_id?: string;
          section_id?: string | null;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          note_id?: string;
          topic_id?: string;
          user_id?: string;
          section_id?: string | null;
          is_primary?: boolean;
          created_at?: string;
        };
      };
      trials: {
        Row: {
          id: string;
          user_id: string;
          acronym: string;
          full_name: string | null;
          year: number | null;
          population: string | null;
          intervention: string | null;
          comparator: string | null;
          result: string | null;
          notes: string | null;
          superseded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          acronym: string;
          full_name?: string | null;
          year?: number | null;
          population?: string | null;
          intervention?: string | null;
          comparator?: string | null;
          result?: string | null;
          notes?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          acronym?: string;
          full_name?: string | null;
          year?: number | null;
          population?: string | null;
          intervention?: string | null;
          comparator?: string | null;
          result?: string | null;
          notes?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      trial_topics: {
        Row: {
          trial_id: string;
          topic_id: string;
          user_id: string;
          section_id: string | null;
          created_at: string;
        };
        Insert: {
          trial_id: string;
          topic_id: string;
          user_id?: string;
          section_id?: string | null;
          created_at?: string;
        };
        Update: {
          trial_id?: string;
          topic_id?: string;
          user_id?: string;
          section_id?: string | null;
          created_at?: string;
        };
      };
      note_links: {
        Row: {
          id: string;
          user_id: string;
          source_type: LinkEndpointType;
          source_id: string;
          target_type: LinkEndpointType;
          target_id: string;
          relation: LinkRelation;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          source_type: LinkEndpointType;
          source_id: string;
          target_type: LinkEndpointType;
          target_id: string;
          relation: LinkRelation;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: LinkEndpointType;
          source_id?: string;
          target_type?: LinkEndpointType;
          target_id?: string;
          relation?: LinkRelation;
          created_at?: string;
        };
      };
      daily_activity: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          notes_count: number;
          streak_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          notes_count?: number;
          streak_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          notes_count?: number;
          streak_days?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: SubscriptionStatus;
          subscription_plan: SubscriptionPlan;
          valid_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: SubscriptionStatus;
          subscription_plan?: SubscriptionPlan;
          valid_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: SubscriptionStatus;
          subscription_plan?: SubscriptionPlan;
          valid_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      usage_quotas: {
        Row: {
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          flashcard_generations_limit: number | null;
          note_improvements_limit: number | null;
          flashcard_generations_used: number;
          note_improvements_used: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period_start: string;
          period_end: string;
          flashcard_generations_limit?: number | null;
          note_improvements_limit?: number | null;
          flashcard_generations_used?: number;
          note_improvements_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          period_start?: string;
          period_end?: string;
          flashcard_generations_limit?: number | null;
          note_improvements_limit?: number | null;
          flashcard_generations_used?: number;
          note_improvements_used?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      api_usage_logs: {
        Row: {
          id: string;
          user_id: string;
          feature_type: 'flashcard_generation' | 'note_improvement';
          api_cost: number;
          tokens_used: number | null;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          feature_type: 'flashcard_generation' | 'note_improvement';
          api_cost: number;
          tokens_used?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          feature_type?: 'flashcard_generation' | 'note_improvement';
          api_cost?: number;
          tokens_used?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Functions: {
      topic_descendants: { Args: { p_topic_id: string }; Returns: string[] };
      notes_in_topic: {
        Args: { p_topic_id: string; p_include_descendants?: boolean };
        Returns: Database['public']['Tables']['notes']['Row'][];
      };
      search_topics: { Args: { p_query: string; p_limit?: number }; Returns: TopicSearchResult[] };
      topic_note_counts: { Args: Record<string, never>; Returns: { topic_id: string; note_count: number }[] };
      set_note_topics: { Args: { p_note_id: string; p_links: NoteTopicLinkInput[] }; Returns: void };
      set_trial_topics: { Args: { p_trial_id: string; p_links: TrialTopicLinkInput[] }; Returns: void };
      reorder_topic_sections: { Args: { p_topic_id: string; p_section_ids: string[] }; Returns: void };
      [key: string]: unknown;
    };
    Enums: {
      [key: string]: string[];
    };
  };
}

// User types
export type UserRow = Database['public']['Tables']['profiles']['Row'];
export type UserInsert = Database['public']['Tables']['profiles']['Insert'];
export type UserUpdate = Database['public']['Tables']['profiles']['Update'];

// Note types
export type NoteRow = Database['public']['Tables']['notes']['Row'];
export type NoteInsert = Database['public']['Tables']['notes']['Insert'];
export type NoteUpdate = Database['public']['Tables']['notes']['Update'];

// Category types
export type CategoryRow = Database['public']['Tables']['categories']['Row'];
export type CategoryInsert = Database['public']['Tables']['categories']['Insert'];
export type CategoryUpdate = Database['public']['Tables']['categories']['Update'];

// Tag types
export type TagRow = Database['public']['Tables']['tags']['Row'];
export type TagInsert = Database['public']['Tables']['tags']['Insert'];
export type TagUpdate = Database['public']['Tables']['tags']['Update'];

// Topic, trial and link types
export type TopicRow = Database['public']['Tables']['topics']['Row'];
export type TopicInsert = Database['public']['Tables']['topics']['Insert'];
export type TopicUpdate = Database['public']['Tables']['topics']['Update'];
export type TopicEdgeRow = Database['public']['Tables']['topic_edges']['Row'];
export type TopicSectionRow = Database['public']['Tables']['topic_sections']['Row'];
export type TopicSectionInsert = Database['public']['Tables']['topic_sections']['Insert'];
export type NoteTopicRow = Database['public']['Tables']['note_topics']['Row'];
export type TrialRow = Database['public']['Tables']['trials']['Row'];
export type TrialInsert = Database['public']['Tables']['trials']['Insert'];
export type TrialUpdate = Database['public']['Tables']['trials']['Update'];
export type TrialTopicRow = Database['public']['Tables']['trial_topics']['Row'];
export type NoteLinkRow = Database['public']['Tables']['note_links']['Row'];
export type NoteLinkInsert = Database['public']['Tables']['note_links']['Insert'];

// Daily Activity types
export type DailyActivityRow = Database['public']['Tables']['daily_activity']['Row'];
export type DailyActivityInsert = Database['public']['Tables']['daily_activity']['Insert'];
export type DailyActivityUpdate = Database['public']['Tables']['daily_activity']['Update'];

// Subscription types
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
export type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert'];
export type SubscriptionUpdate = Database['public']['Tables']['subscriptions']['Update'];

// Usage Quota types
export type UsageQuotaRow = Database['public']['Tables']['usage_quotas']['Row'];
export type UsageQuotaInsert = Database['public']['Tables']['usage_quotas']['Insert'];
export type UsageQuotaUpdate = Database['public']['Tables']['usage_quotas']['Update'];

// API Usage Log types
export type ApiUsageLogRow = Database['public']['Tables']['api_usage_logs']['Row'];
export type ApiUsageLogInsert = Database['public']['Tables']['api_usage_logs']['Insert'];
export type ApiUsageLogUpdate = Database['public']['Tables']['api_usage_logs']['Update'];

// Extended Note type with joined data if needed
export type NoteWithAuthor = NoteRow & {
  author: {
    email: string;
    id: string;
  };
};

// Supabase Auth specific types
export type SignUpCredentials = {
  email: string;
  password: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

// Export simplified types for use in the application
export type Note = NoteRow;
export type Category = CategoryRow;
export type Tag = TagRow;
export type DailyActivity = DailyActivityRow;
export type Subscription = SubscriptionRow;
export type UsageQuota = UsageQuotaRow;
export type ApiUsageLog = ApiUsageLogRow;

// Quota check result type
export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  message?: string;
}

// Feature types for quota tracking
export type QuotaFeatureType = 'flashcard_generation' | 'note_improvement';