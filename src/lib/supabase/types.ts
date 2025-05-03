// Define category enum to match the database
export type NoteCategory = 'Neurology' | 'Cardiology' | 'General' | 'Procedures';

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
          category: NoteCategory;
          created_at: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: Record<string, unknown>;
          tags?: string[];
          category: NoteCategory;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: Record<string, unknown>;
          tags?: string[];
          category?: NoteCategory;
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