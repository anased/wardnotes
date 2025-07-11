// src/lib/supabase/types.ts
export type NoteCategory = string; // Changed from enum to string to support custom categories

// Define subscription status and plan types
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid' | 'free';
export type SubscriptionPlan = 'free' | 'premium';

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
    };
    Views: {
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Functions: Record<string, unknown>;
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

// Daily Activity types
export type DailyActivityRow = Database['public']['Tables']['daily_activity']['Row'];
export type DailyActivityInsert = Database['public']['Tables']['daily_activity']['Insert'];
export type DailyActivityUpdate = Database['public']['Tables']['daily_activity']['Update'];

// Subscription types
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
export type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert'];
export type SubscriptionUpdate = Database['public']['Tables']['subscriptions']['Update'];

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