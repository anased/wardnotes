// src/app/auth/reset-password/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import PageContainer from '@/components/layout/PageContainer';
import NewPasswordForm from '@/components/auth/NewPasswordForm';

export default function ResetPasswordPage() {
  const [isValidToken, setIsValidToken] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      try {
        setIsCheckingToken(true);
        const { data, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        // If we have a session and we've reached this page, we're in password reset mode
        if (data.session) {
          setIsValidToken(true);
        } else {
          // No valid session, redirect to forgot password
          router.push('/auth/forgot-password');
        }
      } catch (err) {
        console.error('Error checking session:', err);
        router.push('/auth/forgot-password');
      } finally {
        setIsCheckingToken(false);
      }
    };
    
    checkSession();
  }, [router]);

  if (isCheckingToken) {
    return (
      <PageContainer showMobileNav={false}>
        <div className="container max-w-md px-4 py-8 mx-auto text-center">
          <div className="w-8 h-8 mx-auto border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Verifying your reset link...</p>
        </div>
      </PageContainer>
    );
  }

  if (!isValidToken) {
    return null; // Router will redirect
  }

  return (
    <PageContainer showMobileNav={false}>
      <div className="container max-w-md px-4 py-8 mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Set New Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            WardNotes
          </p>
        </div>
        
        <div className="overflow-hidden bg-white rounded-lg shadow-sm dark:bg-gray-800">
          <div className="p-6">
            <NewPasswordForm />
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <Link href="/auth" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
            &larr; Back to Sign In
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}