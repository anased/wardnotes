// src/app/auth/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

/**
 * Client-side callback page that handles OAuth redirects with tokens in the URL hash.
 * This is needed because hash fragments (#access_token=...) are never sent to the server,
 * so the server-side route.ts cannot handle them.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'error' | 'success'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check if we have tokens in the URL hash (implicit OAuth flow)
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const error = hashParams.get('error');
          const errorDescription = hashParams.get('error_description');

          // Handle OAuth error
          if (error) {
            console.error('OAuth error:', error, errorDescription);
            setStatus('error');
            setErrorMessage(errorDescription || error || 'Authentication failed');
            setTimeout(() => {
              router.push(`/auth?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}`);
            }, 1500);
            return;
          }

          // Handle access token from implicit flow
          if (accessToken) {
            console.log('Found access token in URL hash, setting session...');

            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });

            if (sessionError) {
              console.error('Error setting session:', sessionError);
              setStatus('error');
              setErrorMessage(sessionError.message);
              setTimeout(() => {
                router.push(`/auth?error=session_error&description=${encodeURIComponent(sessionError.message)}`);
              }, 1500);
              return;
            }

            console.log('Session set successfully, redirecting to dashboard...');
            setStatus('success');

            // Clean up the URL and redirect
            window.history.replaceState({}, document.title, '/auth/callback');
            router.push('/dashboard');
            return;
          }
        }

        // Check for code in query params (PKCE flow - handled by route.ts)
        // If we reach here with a code, the route.ts should have handled it
        // This fallback is for edge cases
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          // Code should be handled by route.ts, but if we're here, try to exchange it
          console.log('Found code in query params, exchanging for session...');

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('Error exchanging code:', exchangeError);
            setStatus('error');
            setErrorMessage(exchangeError.message);
            setTimeout(() => {
              router.push(`/auth?error=exchange_error&description=${encodeURIComponent(exchangeError.message)}`);
            }, 1500);
            return;
          }

          setStatus('success');
          router.push('/dashboard');
          return;
        }

        // No tokens or code found - check if user is already authenticated
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('User already has session, redirecting to dashboard...');
          setStatus('success');
          router.push('/dashboard');
          return;
        }

        // No valid auth data found
        console.error('No authentication data found in callback URL');
        setStatus('error');
        setErrorMessage('No authentication data found');
        setTimeout(() => {
          router.push('/auth?error=missing_auth_data');
        }, 1500);

      } catch (err) {
        console.error('Unexpected error during auth callback:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
        setTimeout(() => {
          router.push('/auth?error=unexpected_error');
        }, 1500);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center p-8">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Completing sign in...
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Please wait while we verify your authentication.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Sign in successful!
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Authentication failed
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {errorMessage || 'An error occurred during sign in.'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
              Redirecting to login page...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
