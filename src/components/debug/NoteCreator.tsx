// src/components/debug/NoteCreator.tsx
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

export default function NoteCreator() {
  const [title, setTitle] = useState('Test Note');
  const [content, setContent] = useState('This is a test note content.');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNote = async () => {
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
        throw new Error('You must be logged in to create a note');
      }
      
      // Create a note directly with Supabase client
      const { data: user } = await supabase.auth.getUser();
      
      if (!user.user) {
        throw new Error('Could not get authenticated user');
      }
      
      // Prepare the note content in TipTap format
      const noteContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: content
              }
            ]
          }
        ]
      };
      
      // Create the note
      const { data: newNote, error: insertError } = await supabase
        .from('notes')
        .insert({
          title,
          content: noteContent,
          user_id: user.user.id,
          tags: ['test', 'debug'],
          category: 'General'
        })
        .select();
      
      if (insertError) {
        throw new Error(`Insert error: ${insertError.message}`);
      }
      
      setResult({
        success: true,
        note: newNote
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult({
        success: false,
        error: err
      });
      console.error('Note creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-300 rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
      <h2 className="text-lg font-semibold mb-4">Note Creator</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">
        Direct note creation tool to test the database connection.
      </p>
      
      <div className="space-y-4 mb-4">
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>
      
      <Button onClick={createNote} isLoading={loading}>
        Create Note
      </Button>
      
      {error && (
        <div className="mt-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      {result && (
        <div className="mt-4">
          <div className={`p-3 rounded-lg ${result.success ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
            <h3 className="font-medium mb-2">
              {result.success ? 'Note Created Successfully' : 'Creation Failed'}
            </h3>
            <pre className="text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}