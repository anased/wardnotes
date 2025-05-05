'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Image from 'next/image';

export default function ProfilePage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { notes } = useNotes();
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    // If not logged in, redirect to login page
    if (!authLoading && !user) {
      router.push('/auth');
    }

    // Check if dark mode is enabled in localStorage
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(isDarkMode);

    // Apply dark mode class to document if enabled
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user, authLoading, router]);

  const handleToggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);

    // Save preference to localStorage
    localStorage.setItem('darkMode', String(newDarkMode));

    // Apply dark mode class to document
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSignOut = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      // Navigation is handled in the useAuth hook
    } catch (err) {
      console.error('Error signing out:', err);
      setIsLoggingOut(false);
    }
  };

  // Check if user is signed in with Google
  const isGoogleLogin = user?.app_metadata?.provider === 'google';
  const userAvatar = user?.user_metadata?.avatar_url;
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';

  if (authLoading) {
    return (
      <PageContainer title="Profile">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Profile">
      <div className="max-w-md mx-auto space-y-8">
        {/* User info */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Account Information</h2>

          {isGoogleLogin && userAvatar && (
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-primary-500">
                <Image
                  src={userAvatar}
                  alt="Profile Photo"
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            </div>
          )}

          {isGoogleLogin && userName && (
            <div className="mb-4 text-center">
              <span className="block text-gray-900 dark:text-gray-100 font-medium">
                {userName}
              </span>
              <span className="text-sm text-primary-600 dark:text-primary-400">
                Google Account
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Email
              </span>
              <span className="block mt-1 text-gray-900 dark:text-gray-100">
                {user?.email}
              </span>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Note Count
              </span>
              <span className="block mt-1 text-gray-900 dark:text-gray-100">
                {notes.length}
              </span>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Login Method
              </span>
              <span className="block mt-1 text-gray-900 dark:text-gray-100">
                {isGoogleLogin ? 'Google' : 'Email & Password'}
              </span>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Settings</h2>

          <div className="flex items-center justify-between">
            <span className="text-gray-900 dark:text-gray-100">Dark Mode</span>
            <button
              onClick={handleToggleDarkMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${darkMode ? 'bg-primary-600' : 'bg-gray-200'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Sign out button */}
        <div className="flex justify-center">
          <Button
            onClick={handleSignOut}
            isLoading={isLoggingOut}
            variant="outline"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
