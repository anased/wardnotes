import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default async function Home() {
  // Check if user is already logged in
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { session } } = await supabase.auth.getSession();

  // If logged in, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container flex items-center justify-between h-16 px-4 mx-auto">
          <div className="flex items-center">
            <span className="text-xl font-bold text-primary-600 dark:text-primary-400">WardNotes</span>
          </div>
          
          <nav>
            <Link href="/auth" className="btn btn-primary">
              Sign In
            </Link>
          </nav>
        </div>
      </header>
      
      <main className="flex flex-1">
        <div className="container grid items-center grid-cols-1 px-4 py-16 mx-auto md:grid-cols-2 gap-12">
          <div className="flex flex-col space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              Capture medical knowledge quickly during your clinical rotations
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              A simple, mobile-first app designed specifically for medical residents and students to organize clinical learning points.
            </p>
            <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
              <Link href="/auth" className="btn btn-primary">
                Get Started
              </Link>
              <Link href="/auth?tab=signup" className="btn btn-outline">
                Create Account
              </Link>
            </div>
          </div>
          
          <div className="hidden md:flex justify-center">
            <div className="relative w-full max-w-md">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg blur opacity-30"></div>
              <div className="relative bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                <div className="space-y-4">
                  <div className="h-8 w-24 bg-primary-100 dark:bg-primary-900 rounded-md"></div>
                  <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                  <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                  <div className="mt-6 space-y-2">
                    <div className="h-10 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center px-3">
                      <div className="h-4 w-4 bg-primary-400 dark:bg-primary-600 rounded-full mr-2"></div>
                      <div className="h-4 w-1/3 bg-gray-300 dark:bg-gray-600 rounded-md"></div>
                    </div>
                    <div className="h-10 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center px-3">
                      <div className="h-4 w-4 bg-primary-400 dark:bg-primary-600 rounded-full mr-2"></div>
                      <div className="h-4 w-1/2 bg-gray-300 dark:bg-gray-600 rounded-md"></div>
                    </div>
                    <div className="h-10 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center px-3">
                      <div className="h-4 w-4 bg-primary-400 dark:bg-primary-600 rounded-full mr-2"></div>
                      <div className="h-4 w-2/5 bg-gray-300 dark:bg-gray-600 rounded-md"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="py-8 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 mx-auto text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} WardNotes. Made for medical professionals.
          </p>
        </div>
      </footer>
    </div>
  );
}

