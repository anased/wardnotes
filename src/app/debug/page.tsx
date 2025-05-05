// src/app/debug/page.tsx
'use client';

import { useState } from 'react';
import UserDebugger from '@/components/debug/UserDebugger';
import TestInsert from '@/components/debug/TestInsert';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';
import RlsFixer from '@/components/debug/RlsFixer';
import NoteCreator from '@/components/debug/NoteCreator';

export default function DebugPage() {
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [envInfo, setEnvInfo] = useState<any>(null);

  const checkAuth = async () => {
    setLoading(true);
    
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        setAuthInfo({ error: sessionError.message });
        return;
      }
      
      if (!session) {
        setAuthInfo({ status: 'Not authenticated' });
        return;
      }
      
      // Get user info
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        setAuthInfo({ error: userError.message });
        return;
      }
      
      setAuthInfo({
        authenticated: true,
        user: {
          id: user?.id,
          email: user?.email,
        },
        session: {
          // Just use current date for last sign in
          lastSignIn: new Date().toLocaleString(),
          expires: new Date(session?.expires_at! * 1000).toLocaleString()
        }
      });
      
      // Check env info
      setEnvInfo({
        nodeEnv: process.env.NODE_ENV,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15) + '...',
      });
    } catch (error) {
      setAuthInfo({ error: `Exception: ${error}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Database Debug Tools</h1>
      
      <div className="space-y-6">
        <div className="p-4 border border-gray-300 rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-4">Auth Status</h2>
          
          <Button onClick={checkAuth} isLoading={loading}>
            Check Authentication
          </Button>
          
          {authInfo && (
            <div className="mt-4">
              {authInfo.error ? (
                <div className="p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
                  {authInfo.error}
                </div>
              ) : authInfo.authenticated ? (
                <div>
                  <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg text-green-800 dark:text-green-200 mb-4">
                    ✓ Authenticated as {authInfo.user.email}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <h3 className="font-medium mb-2">User</h3>
                      <p><strong>ID:</strong> {authInfo.user.id}</p>
                      <p><strong>Email:</strong> {authInfo.user.email}</p>
                    </div>
                    
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <h3 className="font-medium mb-2">Session</h3>
                      <p><strong>Expires:</strong> {authInfo.session.expires}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg text-yellow-800 dark:text-yellow-200">
                  Not authenticated
                </div>
              )}
            </div>
          )}
          
          {envInfo && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <h3 className="font-medium mb-2">Environment</h3>
              <p><strong>Node Env:</strong> {envInfo.nodeEnv}</p>
              <p><strong>Supabase URL:</strong> {envInfo.supabaseUrl}</p>
            </div>
          )}
        </div>
        
        <UserDebugger />
        
        <TestInsert />
        <RlsFixer />
        <NoteCreator />
      </div>
    </div>
  );
}