'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { useNotification } from './NotificationContext';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getUserProfile: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { showNotification } = useNotification();

  useEffect(() => {
    let mounted = true;

    // Get initial session
    const initSession = async () => {
      if (!mounted) return;
      
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      
      if (!mounted) return;
      
      if (error) {
        console.error('Error getting session:', error);
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      
      setLoading(false);
    };

    initSession();

    // Listen for auth state changes - ONLY ONE LISTENER FOR THE ENTIRE APP
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        
        console.log('🔑 Global auth state change:', event);
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // On sign-in, redirect to dashboard ONLY if currently on auth page
        if (event === 'SIGNED_IN' && newSession) {
          console.log('User signed in, checking current route');
          
          // Only redirect if we're on an auth-related page
          const currentPath = window.location.pathname;
          if (currentPath.startsWith('/auth') || currentPath === '/') {
            console.log('Redirecting from auth page to dashboard');
            showNotification('Successfully signed in!', 'success');
            setTimeout(() => {
              router.push('/dashboard');
            }, 100);
          } else {
            console.log('User already on protected page, not redirecting');
          }
        }
        
        // On sign-out, redirect to home
        if (event === 'SIGNED_OUT') {
          console.log('User signed out, redirecting to home');
          router.push('/');
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
  
      if (error) throw error;
      
      // Check if user already exists
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error('This email is already in use. Please use a different email or try signing in.');
      }
      
      return data;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // The onAuthStateChange listener will handle redirection
      return data;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      
      // Get current origin for the redirectTo
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) throw error;
      
      // No need to redirect here - the OAuth flow will handle it
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // The onAuthStateChange listener will handle redirection
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Get user profile data
  const getUserProfile = async () => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    getUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}