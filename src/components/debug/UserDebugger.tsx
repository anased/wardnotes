// src/components/debug/UserDebugger.tsx
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

export default function UserDebugger() {
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
      const response = await fetch('/api/debug-user', {
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
      <h2 className="text-lg font-semibold mb-4">User & Database Debugger</h2>
      
      <Button onClick={runDebugger} isLoading={loading}>
        Run User Check
      </Button>
      
      {error && (
        <div className="mt-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      {debugInfo && (
        <div className="mt-4">
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
            <h3 className="font-medium mb-2">Authenticated User</h3>
            <p><strong>ID:</strong> {debugInfo.authUser.id}</p>
            <p><strong>Email:</strong> {debugInfo.authUser.email}</p>
          </div>
          
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
            <h3 className="font-medium mb-2">Profiles in Database ({debugInfo.profiles?.length || 0})</h3>
            {debugInfo.profilesError ? (
              <p className="text-red-600">{debugInfo.profilesError}</p>
            ) : debugInfo.profiles?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {debugInfo.profiles.map((profile: any) => (
                    <tr key={profile.id} className="border-b dark:border-gray-600">
                      <td className="py-2 font-mono text-xs break-all">{profile.id}</td>
                      <td className="py-2">{profile.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No profiles found in database</p>
            )}
          </div>
          
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <h3 className="font-medium mb-2">All Notes in Database ({debugInfo.allNotes?.length || 0})</h3>
            {debugInfo.allNotesError ? (
              <p className="text-red-600">{debugInfo.allNotesError}</p>
            ) : debugInfo.allNotes?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="text-left py-2">Note ID</th>
                    <th className="text-left py-2">Title</th>
                    <th className="text-left py-2">User ID</th>
                    <th className="text-left py-2">Matches Auth?</th>
                  </tr>
                </thead>
                <tbody>
                  {debugInfo.allNotes.map((note: any) => (
                    <tr key={note.id} className="border-b dark:border-gray-600">
                      <td className="py-2 font-mono text-xs break-all">{note.id}</td>
                      <td className="py-2">{note.title}</td>
                      <td className="py-2 font-mono text-xs break-all">{note.user_id}</td>
                      <td className="py-2">
                        {note.user_id === debugInfo.authUser.id ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-red-600">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No notes found in database</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}