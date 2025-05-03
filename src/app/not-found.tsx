import Link from 'next/link';
import Button from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16 text-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md mx-auto">
        <h1 className="text-6xl font-bold text-primary-500 dark:text-primary-400">404</h1>
        
        <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
          Page Not Found
        </h2>
        
        <p className="mt-4 mb-8 text-gray-600 dark:text-gray-400">
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        
        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4 justify-center">
          <Link href="/" passHref>
            <Button>
              Return Home
            </Button>
          </Link>
          
          <Link href="/notes" passHref>
            <Button variant="outline">
              Go to Library
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}