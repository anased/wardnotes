// src/components/notes/FlashcardGeneratorModal.tsx
import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase/client';

interface FlashcardGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
}

// Define interfaces for API responses
interface PreviewCardsResponse {
  cards: string[];
}

interface ErrorResponse {
  error: string;
}

export default function FlashcardGeneratorModal({
  isOpen,
  onClose,
  noteId,
  noteTitle,
}: FlashcardGeneratorModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'preview' | 'error'>('idle');
  const [previewCards, setPreviewCards] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Create a memoized version of generatePreview to use in the dependency array
  const generatePreview = useCallback(async () => {
    try {
      setStatus('loading');
      setDebugInfo(`Starting preview generation for note ID: ${noteId}`);
      
      // Verify we have a valid note ID
      if (!noteId) {
        throw new Error('Note ID is missing');
      }
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        setDebugInfo(`Session error: ${JSON.stringify(sessionError)}`);
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error('You must be logged in to generate flashcards');
      }
      
      setDebugInfo(prevDebug => prevDebug + `\nUser authenticated: ${session.user.id}`);
      
      // Get the access token
      const token = session.access_token;
      
      // Log the note ID and token (partially redacted for security)
      const tokenPreview = token.substring(0, 10) + '...' + token.substring(token.length - 10);
      setDebugInfo(prevDebug => prevDebug + `\nUsing noteId: ${noteId}\nToken: ${tokenPreview}`);
      
      // Call API to get a preview of the flashcards with the token in Authorization header
      setDebugInfo(prevDebug => prevDebug + `\nSending request to: /api/preview-flashcards?noteId=${noteId}`);
      
      // Make API request
      const response = await fetch(`/api/preview-flashcards?noteId=${noteId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setDebugInfo(prevDebug => prevDebug + `\nAPI response status: ${response.status}`);
      
      const responseText = await response.text();
      
      // Explicitly type the parsed data
      let responseData: PreviewCardsResponse | ErrorResponse;
      
      try {
        responseData = JSON.parse(responseText);
        setDebugInfo(prevDebug => prevDebug + `\nParsed response: ${JSON.stringify(responseData).substring(0, 200)}...`);
      } catch (_e) {
        setDebugInfo(prevDebug => prevDebug + `\nResponse parsing error: ${_e}\nResponse text: ${responseText.substring(0, 200)}...`);
        throw new Error('Failed to parse API response');
      }
      
      if (!response.ok) {
        setDebugInfo(prevDebug => prevDebug + `\nAPI error: ${JSON.stringify(responseData)}`);
        throw new Error('error' in responseData ? responseData.error : 'Failed to generate flashcards');
      }
      
      // Type guard to ensure we have the cards property
      if ('cards' in responseData) {
        setPreviewCards(responseData.cards);
        setStatus('preview');
      } else {
        throw new Error('Invalid response format: missing cards array');
      }
    } catch (err) {
      console.error('Error generating preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
      setStatus('error');
    }
  }, [noteId]); // Add noteId as a dependency

  // When opened, generate a preview of the flashcards
  useEffect(() => {
    if (isOpen && status === 'idle') {
      generatePreview();
    }
  }, [isOpen, status, noteId, generatePreview]); // Include generatePreview in the dependency array

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setStatus('idle');
      setPreviewCards([]);
      setError('');
      setDebugInfo('');
    }
  }, [isOpen]);

  // Function to download the Anki package
  const downloadAnkiPackage = async () => {
    try {
      setStatus('loading');
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('You must be logged in to download flashcards');
      }
      
      // Get the access token
      const token = session.access_token;
      
      // Get the download URL
      const downloadUrl = `/api/generate-flashcards?noteId=${noteId}`;
      
      // Fetch the file with token in Authorization header
      const response = await fetch(downloadUrl, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const responseText = await response.text();
        let errorData;
        
        try {
          errorData = JSON.parse(responseText);
        } catch (_e) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        throw new Error(errorData.error || 'Failed to download flashcards');
      }
      
      // Get the text from the response
      const textContent = await response.text();
      
      // Create a blob from the text content
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      
      // Create and click an anchor element to download the file
      const a = document.createElement('a');
      a.href = url;
      a.download = `${noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_flashcards.txt`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Close modal after download starts
      onClose();
    } catch (err) {
      console.error('Error downloading flashcards:', err);
      setError(err instanceof Error ? err.message : 'Failed to download flashcards');
      setStatus('error');
    }
  };

  // Styling for the flashcard in the preview
  const renderFlashcard = (card: string, index: number) => {
    // Highlight the cloze deletions but preserve the original format
    const highlightedText = card.replace(
      /(\{\{c\d+::.*?(?:::.*?)?\}\})/g, 
      '<span class="bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-1 rounded">$1</span>'
    );
    
    return (
      <div key={index} className="p-4 mb-4 bg-white border rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div dangerouslySetInnerHTML={{ __html: highlightedText }} />
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-3xl p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Generate Anki Flashcards</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center p-8">
            <Spinner size="lg" color="primary" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Generating flashcards...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            <p>Error: {error}</p>
            {debugInfo && (
              <details className="mt-2">
                <summary className="cursor-pointer">Debug Information</summary>
                <pre className="mt-2 p-2 bg-gray-800 text-white rounded text-xs overflow-auto whitespace-pre-wrap">
                  {debugInfo}
                </pre>
              </details>
            )}
            <Button onClick={generatePreview} className="mt-4">
              Try Again
            </Button>
          </div>
        )}

        {status === 'preview' && (
          <>
            <div className="mb-4">
              <p className="mb-4 text-gray-700 dark:text-gray-300">
                Here is a preview of the flashcards that will be generated:
              </p>
              
              <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">About Anki Cloze Format</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  Cards use Anki's cloze deletion format. The highlighted sections with double curly braces will be hidden in Anki and become what you need to recall.
                </p>
              </div>
              
              {previewCards.length === 0 ? (
                <div className="p-4 mb-4 text-yellow-700 bg-yellow-100 rounded-lg dark:bg-yellow-900 dark:text-yellow-200">
                  No flashcards could be generated. Try with a note that has more medical content.
                </div>
              ) : (
                <div className="space-y-4">
                  {previewCards.map((card, index) => renderFlashcard(card, index))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={downloadAnkiPackage} disabled={previewCards.length === 0}>
                Download Anki Flashcards (Text Format)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}