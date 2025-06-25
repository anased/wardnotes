import React, { useState, useRef, useCallback } from 'react';
import Button from '@/components/ui/Button';

interface ClozeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function ClozeEditor({ value, onChange, placeholder, rows = 4 }: ClozeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [clozeCounter, setClozeCounter] = useState(1);

  const getSelectedText = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return null;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    if (start === end) return null; // No selection
    
    return {
      selectedText: textarea.value.substring(start, end),
      start,
      end
    };
  }, []);

  const convertToCloze = useCallback(() => {
    const selection = getSelectedText();
    if (!selection) {
      alert('Please select some text first');
      return;
    }

    const { selectedText, start, end } = selection;
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Create the cloze deletion
    const clozeText = `{{c${clozeCounter}::${selectedText}}}`;
    
    // Replace the selected text with cloze syntax
    const newValue = value.substring(0, start) + clozeText + value.substring(end);
    
    onChange(newValue);
    setClozeCounter(prev => prev + 1);

    // Restore focus and set cursor position after the cloze
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + clozeText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  }, [value, onChange, clozeCounter, getSelectedText]);

  const clearAllCloze = useCallback(() => {
    // Remove all cloze syntax and extract just the text
    const cleanText = value.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1');
    onChange(cleanText);
    setClozeCounter(1);
  }, [value, onChange]);

  const previewCloze = useCallback(() => {
    if (!value.includes('{{c')) {
      return value;
    }
    
    // Show blanks for preview
    return value.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '[...]');
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Cloze Content
        </label>
        <div className="flex space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={convertToCloze}
            className="text-xs"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2" />
            </svg>
            Make Cloze
          </Button>
          {value.includes('{{c') && (
            <Button
              type="button"
              variant="outline"
              onClick={clearAllCloze}
              className="text-xs text-red-600 hover:text-red-700"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All
            </Button>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter your content, then select text and click 'Make Cloze' to create cloze deletions"}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 dark:focus:border-blue-400 resize-none"
        required
      />

      <div className="text-xs text-gray-500 space-y-1">
        <p>
          <strong>How to use:</strong> Type your content, select any word or phrase, then click "Make Cloze" to convert it.
        </p>
        <p>
          <strong>Next cloze number:</strong> c{clozeCounter}
        </p>
      </div>

      {/* Preview */}
      {value && (
        <div className="mt-3">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            Preview (how it will look during study):
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border text-sm">
            {value.includes('{{c') ? (
              <div>
                <div className="mb-2">
                  <span className="text-xs text-gray-500">Question view:</span>
                  <div className="mt-1">{previewCloze()}</div>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Answer view:</span>
                  <div 
                    className="mt-1"
                    dangerouslySetInnerHTML={{
                      __html: value.replace(
                        /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g,
                        '<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded font-semibold">$1</span>'
                      )
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-gray-500">No cloze deletions yet. Select text and click "Make Cloze" to add them.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}