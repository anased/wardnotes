'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useNotification } from '@/lib/context/NotificationContext';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check URL for hash or error parameters
        const hash = window.location.hash;
        const queryParams = new URLSearchParams(window.location.search);
        const errorParam = queryParams.get('error');
        const errorDescription = queryParams.get('error_description');

        // Handle explicit errors
        if (errorParam) {
          console.error('Auth error:', errorParam, errorDescription);
          setError(`Authentication error: ${errorDescription || errorParam}`);
          showNotification(`Authentication failed: ${errorDescription || 'Unknown error'}`, 'error');
          setTimeout(() => router.push('/auth'), 2000);
          return;
        }

        // Handle successful auth via hash (access token present in URL fragment)
        if (hash && hash.includes('access_token')) {
          console.log('Processing hash authentication response');
          
          // Use Supabase's auth functionality to set the session from hash
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Error setting session from hash:', error);
            throw error;
          }
          
          if (data?.session) {
            console.log('Session established successfully');
            showNotification('Successfully signed in with Google!', 'success');
            router.push('/dashboard');
          } else {
            // Try again with manual parsing of hash
            console.log('No session found, attempting to parse hash manually');
            
            // Note: This is just an example of how we might manually parse the hash
            // Supabase's SDK should handle this for us, but as a fallback:
            const hashParams = new URLSearchParams(hash.substring(1));
            const accessToken = hashParams.get('access_token');
            
            if (accessToken) {
              // Manually set the session using the token
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: hashParams.get('refresh_token') || '',
              });
              
              showNotification('Successfully signed in with Google!', 'success');
              router.push('/dashboard');
            } else {
              throw new Error('No access token found in URL');
            }
          }
        } else {
          // No hash with token and no explicit error
          // This could be either the code flow (which should be handled by route.ts)
          // or something went wrong
          console.log('No hash or error parameters found');
          const { data } = await supabase.auth.getSession();
          
          if (data?.session) {
            // We have a session, so the code exchange worked
            showNotification('Successfully signed in!', 'success');
            router.push('/dashboard');
          } else {
            // No session and no hash parameters
            throw new Error('Authentication failed - no session established');
          }
        }
      } catch (err) {
        const error = err as Error;
        console.error('Auth callback error:', error);
        setError(`Authentication error: ${error.message}`);
        showNotification(`Authentication failed: ${error.message}`, 'error');
        setTimeout(() => router.push('/auth'), 2000);
      }
    };

    handleAuthCallback();
  }, [router, showNotification]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="p-6 mb-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          <h3 className="mb-2 text-lg font-medium">Authentication Error</h3>
          <p>{error}</p>
        </div>
        <p>Redirecting to login page...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      <h2 className="mt-6 text-xl">Completing authentication...</h2>
    </div>
  );
}