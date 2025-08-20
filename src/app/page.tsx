'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('notes');
  
  // Check if user is already logged in
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    
    checkSession();
  }, [router]);

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
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white lg:text-5xl">
              Transform your clinical notes into powerful flashcards with AI
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 lg:text-xl">
              The smart note-taking app for medical students and residents. Automatically generate flashcards from your notes and master medical knowledge with spaced repetition.
            </p>
            
            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Free Forever</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Secure & Private</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>HIPAA-Ready</span>
              </div>
            </div>

            <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
              <Link href="/auth?tab=signup" className="btn btn-primary text-lg px-8 py-3">
                Start Free Trial
              </Link>
              <Link href="/auth" className="btn btn-outline text-lg px-8 py-3">
                Sign In
              </Link>
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No credit card required • Start studying smarter today
            </p>
          </div>
          
          <div className="hidden md:flex justify-center">
            <div className="relative w-full max-w-md">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg blur opacity-30"></div>
              <div className="relative bg-gray-50 dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden">
                
                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'notes'
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Notes
                  </button>
                  <button
                    onClick={() => setActiveTab('flashcards')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'flashcards'
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Flashcards
                  </button>
                  <button
                    onClick={() => setActiveTab('tracker')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'tracker'
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Tracker
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-4 min-h-[300px] transition-all duration-300">
                  
                  {/* Notes Tab */}
                  {activeTab === 'notes' && (
                    <div className="space-y-3 fade-in">
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">Heart Failure Management</h3>
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full dark:bg-blue-900 dark:text-blue-300">Cardiology</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Dec 15, 2024</div>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full dark:bg-gray-700 dark:text-gray-300">ace-inhibitors</span>
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full dark:bg-gray-700 dark:text-gray-300">hypertension</span>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">Antibiotic Prophylaxis</h3>
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full dark:bg-green-900 dark:text-green-300">Surgery</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Dec 14, 2024</div>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full dark:bg-gray-700 dark:text-gray-300">surgery-prep</span>
                        </div>
                      </div>
                      <div className="text-center p-3 bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                        <div className="text-xs font-medium text-primary-700 dark:text-primary-300">
                          📝 Rich text editor with medical formatting
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Flashcards Tab */}
                  {activeTab === 'flashcards' && (
                    <div className="space-y-4 fade-in">
                      {/* Stats Overview */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700 text-center">
                          <div className="text-lg font-bold text-blue-600">12</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Due Today</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700 text-center">
                          <div className="text-lg font-bold text-green-600">87%</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Accuracy</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700 text-center">
                          <div className="text-lg font-bold text-orange-600">45</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Total Cards</div>
                        </div>
                      </div>
                      
                      {/* Deck Example */}
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white text-sm">Cardiology Deck</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Heart failure, arrhythmias, hypertension</p>
                          </div>
                          <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                          <span>8 due • 15 total</span>
                          <span>85% accuracy</span>
                        </div>
                      </div>

                      <div className="text-center p-3 bg-gradient-to-r from-secondary-50 to-primary-50 dark:from-secondary-900/20 dark:to-primary-900/20 rounded-lg border border-secondary-200 dark:border-secondary-800">
                        <div className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                          🎯 Spaced repetition algorithm optimizes learning
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tracker Tab */}
                  {activeTab === 'tracker' && (
                    <div className="space-y-4 fade-in">
                      {/* Streak Display */}
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center">
                          <div className="mr-3">
                            <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Current Streak</p>
                            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">7 days</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Activity Summary */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700 text-center">
                          <div className="text-lg font-bold text-blue-600">3</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Notes Today</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700 text-center">
                          <div className="text-lg font-bold text-green-600">15</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">This Week</div>
                        </div>
                      </div>
                      
                      {/* Mini Calendar Visualization */}
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Recent Activity</p>
                        <div className="flex justify-between space-x-1">
                          <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-300 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-400 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-300 rounded-sm"></div>
                          <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
                        </div>
                      </div>

                      <div className="text-center p-3 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-xs font-medium text-green-700 dark:text-green-300">
                          🔥 Build consistency with daily learning habits
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Key Features Section */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Everything you need to master medical knowledge
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Designed specifically for medical education with features that adapt to how you learn
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Smart Note Organization */}
            <div className="card p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Smart Note Organization
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Organize your clinical observations by specialty, rotation, or topic. Rich text editor with support for medical terminology and formatting.
              </p>
            </div>

            {/* AI-Powered Flashcards */}
            <div className="card p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-secondary-100 dark:bg-secondary-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-secondary-600 dark:text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                AI-Powered Flashcards
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Automatically generate high-quality flashcards from your notes using AI. Focus on studying instead of card creation.
              </p>
            </div>

            {/* Spaced Repetition Learning */}
            <div className="card p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Spaced Repetition Learning
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Evidence-based learning system that schedules reviews at optimal intervals for long-term retention of medical knowledge.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Built for medical education excellence
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-12 max-w-2xl mx-auto">
            Developed by medical professionals who understand the challenges of clinical learning
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* HIPAA Compliance */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 mb-4 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">HIPAA-Ready Security</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">Built with healthcare data security standards in mind</p>
            </div>

            {/* Medical Focus */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 mb-4 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Medical-First Design</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">Every feature designed specifically for medical education</p>
            </div>

            {/* Always Learning */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 mb-4 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Continuous Innovation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">Regular updates based on medical education research</p>
            </div>
          </div>
        </div>
      </section>
      
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