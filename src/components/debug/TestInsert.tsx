// src/components/debug/TestInsert.tsx
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

export default function TestInsert() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('You must be logged in to run this test');
      }
      
      // Get the access token
      const token = session.access_token;
      
      // Call test insert API
      const response = await fetch('/api/test-insert', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`API error (${response.status}): ${responseText}`);
      }
      
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Test error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-300 rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
      <h2 className="text-lg font-semibold mb-4">Test Database Insert</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">
        This will attempt to insert a test note and then retrieve it to verify database permissions.
      </p>
      
      <Button onClick={runTest} isLoading={loading}>
        Run Database Insert Test
      </Button>
      
      {error && (
        <div className="mt-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      {result && (
        <div className="mt-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
            <h3 className="font-medium mb-2">Test Results</h3>
            <pre className="text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}