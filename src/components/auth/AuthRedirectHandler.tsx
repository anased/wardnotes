// src/components/auth/AuthRedirectHandler.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useNotification } from '@/lib/context/NotificationContext';

/**
 * This component listens for auth state changes and redirects users
 * Place it in your root layout or a component that's always mounted
 */
export default function AuthRedirectHandler() {
  const router = useRouter();
  const { showNotification } = useNotification();

  useEffect(() => {
    console.log("💡 AuthRedirectHandler mounted - listening for auth changes");
    
    // Check if we're in a post-auth situation (tokens in URL)
    const checkUrlForTokens = () => {
      if (typeof window !== 'undefined') {
        // Check if the hash contains an access token (common in OAuth implicit flow)
        if (window.location.hash && window.location.hash.includes('access_token')) {
          console.log("Found access_token in URL hash - this is a post-auth redirect");
          
          // Extract tokens from hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          if (accessToken) {
            console.log("Found access token, attempting to set session");
            
            // Set session with the tokens
            (async () => {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });
              
              if (error) {
                console.error("Error setting session from URL tokens:", error);
                showNotification("Authentication error: " + error.message, "error");
              } else {
                console.log("Successfully set session from URL tokens");
                showNotification("Successfully signed in!", "success");
                
                // Clean up the URL and redirect to dashboard
                window.history.replaceState({}, document.title, '/');
                router.push('/dashboard');
              }
            })();
          }
        }
      }
    };
    
    // Run once on mount
    checkUrlForTokens();
    
    // Also listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state change event:", event);
      
      if (event === 'SIGNED_IN' && session) {
        console.log("User signed in, redirecting to dashboard");
        showNotification("Successfully signed in!", "success");
        
        // Use a slight delay to ensure state is updated
        setTimeout(() => {
          router.push('/dashboard');
        }, 100);
      }
    });
    
    // Cleanup
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router, showNotification]);

  // This component doesn't render anything
  return null;
}