// src/app/settings/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import Spinner from '@/components/ui/Spinner';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <PageContainer title="Settings">
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Settings">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Profile Settings Card */}
          <Link 
            href="/profile" 
            className="p-6 transition-shadow bg-white rounded-lg shadow hover:shadow-md dark:bg-gray-800"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h2 className="text-xl font-semibold">Profile</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your account information and preferences
            </p>
          </Link>
          
          {/* Categories Settings Card */}
          <Link 
            href="/settings/categories" 
            className="p-6 transition-shadow bg-white rounded-lg shadow hover:shadow-md dark:bg-gray-800"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <h2 className="text-xl font-semibold">Categories</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Manage note categories and colors
            </p>
          </Link>
          
          {/* Tags Settings Card */}
          <Link 
            href="/settings/tags" 
            className="p-6 transition-shadow bg-white rounded-lg shadow hover:shadow-md dark:bg-gray-800"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h.01" />
              </svg>
              <h2 className="text-xl font-semibold">Tags</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Manage tags used to organize your notes
            </p>
          </Link>
          
          {/* Theme Settings Card - For future implementation */}
          <Link 
            href="/profile" 
            className="p-6 transition-shadow bg-white rounded-lg shadow hover:shadow-md dark:bg-gray-800"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              <h2 className="text-xl font-semibold">Theme & Appearance</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Customize the app&apos;s appearance and theme preferences
            </p>
          </Link>
          {/* subscriptioin Settings Card */}
          <Link 
            href="/settings/subscription" 
            className="p-6 transition-shadow bg-white rounded-lg shadow hover:shadow-md dark:bg-gray-800"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <h2 className="text-xl font-semibold">Subscription</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your subscription and billing information
            </p>
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}