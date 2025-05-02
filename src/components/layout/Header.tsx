import Link from 'next/link';
import useAuth from '@/lib/hooks/useAuth';

export default function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="container flex items-center justify-between h-16 px-4 mx-auto">
        <Link href="/" className="flex items-center">
          <span className="text-xl font-bold text-primary-600 dark:text-primary-400">WardNotes</span>
        </Link>
        
        <div className="flex items-center gap-4">
          {user ? (
            <button
              onClick={() => signOut()}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Sign Out
            </button>
          ) : (
            <Link
              href="/auth"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}