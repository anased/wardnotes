'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16 text-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md mx-auto">
        <svg
          className="w-20 h-20 mx-auto mb-6 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
          Something went wrong
        </h1>
        
        <p className="mb-8 text-gray-600 dark:text-gray-400">
          We apologize for the inconvenience. Please try again or contact support if the problem persists.
        </p>
        
        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4 justify-center">
          <Button onClick={reset}>
            Try Again
          </Button>
          
          <Link href="/" passHref>
            <Button variant="outline">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}