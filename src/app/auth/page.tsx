'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';
import PageContainer from '@/components/layout/PageContainer';

export default function AuthPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    // If user is logged in, redirect to dashboard
    if (user && !loading) {
      router.push('/dashboard');
    }
    
    // Set initial tab based on URL query parameter
    const tab = searchParams?.get('tab');
    if (tab === 'signup') {
      setActiveTab('signup');
    }
  }, [user, loading, router, searchParams]);

  return (
    <PageContainer showMobileNav={false}>
      <div className="container max-w-md px-4 py-8 mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">WardNotes</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Organize your clinical learning
          </p>
        </div>
        
        <div className="overflow-hidden bg-white rounded-lg shadow-sm dark:bg-gray-800">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              className={`flex-1 px-4 py-3 text-center ${
                activeTab === 'signin'
                  ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setActiveTab('signin')}
            >
              Sign In
            </button>
            <button
              className={`flex-1 px-4 py-3 text-center ${
                activeTab === 'signup'
                  ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setActiveTab('signup')}
            >
              Create Account
            </button>
          </div>
          
          <div className="p-6">
            {activeTab === 'signin' ? <LoginForm /> : <SignupForm />}
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}