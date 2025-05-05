// src/components/debug/DatabaseDebugger.tsx
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

export default function DatabaseDebugger() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDebugger = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('You must be logged in to run the debugger');
      }
      
      // Get the access token
      const token = session.access_token;
      
      // Call debug API
      const response = await fetch('/api/debug-notes', {
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
      setDebugInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Debug error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-300 rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
      <h2 className="text-lg font-semibold mb-4">Database Debugger</h2>
      
      <Button onClick={runDebugger} isLoading={loading}>
        Run Database Check
      </Button>
      
      {error && (
        <div className="mt-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      {debugInfo && (
        <div className="mt-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <h3 className="font-medium mb-2">User Information</h3>
            <p>User ID: {debugInfo.user.id}</p>
            <p>Email: {debugInfo.user.email}</p>
          </div>
          
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <h3 className="font-medium mb-2">Database Tables</h3>
            {Array.isArray(debugInfo.tables) ? (
              <ul className="list-disc pl-5">
                {debugInfo.tables.map((table: any, index: number) => (
                  <li key={index}>{table.tablename}</li>
                ))}
              </ul>
            ) : (
              <p>{String(debugInfo.tables)}</p>
            )}
          </div>
          
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <h3 className="font-medium mb-2">User Notes ({debugInfo.noteCount})</h3>
            {debugInfo.userNotes.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left py-2">Title</th>
                    <th className="text-left py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {debugInfo.userNotes.map((note: any) => (
                    <tr key={note.id} className="border-b dark:border-gray-600">
                      <td className="py-2 font-mono text-xs break-all">{note.id}</td>
                      <td className="py-2">{note.title}</td>
                      <td className="py-2">{new Date(note.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No notes found for this user</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}