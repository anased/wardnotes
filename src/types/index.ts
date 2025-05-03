// Re-export types from Supabase for convenience
export * from '@/lib/supabase/types';

// Common component props
export interface ChildrenProps {
  children: React.ReactNode;
}

// Form related types
export interface FormState {
  isSubmitting: boolean;
  error: string | null;
  success: boolean;
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    message: string;
    code?: string;
    status?: number;
  };
}

// Theme and layout types
export type ThemeMode = 'light' | 'dark' | 'system';

// Application state types
export interface AuthState {
  user: UserData | null;
  session: SessionData | null;
  loading: boolean;
}

// Define proper user and session types
export interface UserData {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  aud?: string;
}

export interface SessionData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: UserData;
}

// Router params types
export interface NoteRouteParams {
  id: string;
}

// Search and filter types
export interface NoteFilterOptions {
  category?: string;
  tag?: string;
  query?: string;
  sortBy?: 'created_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// UI component specific types
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export interface ToastOptions {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};