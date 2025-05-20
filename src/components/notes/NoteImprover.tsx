// src/components/notes/NoteImprover.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Button from '../ui/Button';
import { TipTapNode } from '@/types/content';
import { convertTipTapToPlainText } from '@/lib/utils/content-converter';

// Define maximum character limit
const MAX_CHARACTERS = 4000;

interface NoteImproverProps {
  content: Record<string, unknown>;
  onImproveSuccess: (improvedContent: string) => void;
}

export default function NoteImprover({ content, onImproveSuccess }: NoteImproverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [improvedContent, setImprovedContent] = useState('');
  
  // Convert TipTap JSON to plain text for character count
  const plainText = convertTipTapToPlainText(content as TipTapNode);
  const characterCount = plainText.length;
  const isOverLimit = characterCount > MAX_CHARACTERS;
  
  const handleImproveNote = async () => {
    if (isOverLimit) {
      setError(`Note exceeds maximum character limit of ${MAX_CHARACTERS} characters`);
      return;
    }
    
    if (characterCount === 0) {
      setError('Cannot improve empty note');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('You must be logged in to improve notes');
      }
      
      // Get the access token
      const token = session.access_token;
      
      // Call API to improve the note
      const response = await fetch('/api/improve-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: plainText }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to improve note');
      }
      
      const data = await response.json();
      setImprovedContent(data.improvedNote);
      setShowImproveModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  const applyImprovedNote = () => {
    onImproveSuccess(improvedContent);
    setShowImproveModal(false);
  };
  
  return (
    <div>
      <div className="flex flex-col mb-4">
        <div className="flex justify-between mb-1">
          <span className={`text-xs ${isOverLimit ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {characterCount} / {MAX_CHARACTERS} characters
          </span>
        </div>
        
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-2">
          <div 
            className={`h-1 rounded-full ${
              isOverLimit 
                ? 'bg-red-500' 
                : characterCount > MAX_CHARACTERS * 0.9 
                  ? 'bg-yellow-500' 
                  : 'bg-primary-500'
            }`} 
            style={{ width: `${Math.min((characterCount / MAX_CHARACTERS) * 100, 100)}%` }}
          />
        </div>
        
        <div className="mt-2">
          <Button
            onClick={handleImproveNote}
            isLoading={isLoading}
            disabled={isOverLimit || characterCount === 0}
            variant="outline"
            className="flex items-center"
          >
            <span className="mr-2">✨</span>
            Improve Note
          </Button>
        </div>
        
        {error && (
          <div className="mt-2 p-2 text-sm text-red-700 bg-red-100 rounded dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}
      </div>
      
      {/* Improvement Preview Modal */}
      {showImproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-3xl p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">Improved Note Preview</h3>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4 whitespace-pre-wrap">
              {improvedContent}
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowImproveModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={applyImprovedNote}
              >
                Apply Improvements
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}