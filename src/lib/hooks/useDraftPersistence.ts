import { useEffect, useRef, useCallback } from 'react';

interface DraftData {
  title: string;
  content: Record<string, unknown>;
  category: string;
  tags: string[];
  timestamp: number;
}

const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Custom hook to persist note draft data to localStorage
 * @param noteId - The ID of the note being edited, or 'new' for a new note
 * @param data - The current form data to persist
 * @param enabled - Whether draft persistence is enabled
 */
export function useDraftPersistence(
  noteId: string | undefined,
  data: Omit<DraftData, 'timestamp'>,
  enabled: boolean = true
) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate storage key based on note ID
  const getStorageKey = useCallback((id: string | undefined): string => {
    return `note-draft-${id || 'new'}`;
  }, []);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback((draftData: Omit<DraftData, 'timestamp'>) => {
    if (!enabled) return;

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the save operation
    debounceTimerRef.current = setTimeout(() => {
      try {
        const storageKey = getStorageKey(noteId);
        const draft: DraftData = {
          ...draftData,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        console.log('Draft saved to localStorage:', storageKey);
      } catch (error) {
        console.error('Failed to save draft to localStorage:', error);
      }
    }, 1000); // Debounce for 1 second
  }, [enabled, noteId, getStorageKey]);

  // Load draft from localStorage
  const loadDraft = useCallback((): DraftData | null => {
    if (!enabled) return null;

    try {
      const storageKey = getStorageKey(noteId);
      const storedData = localStorage.getItem(storageKey);

      if (!storedData) return null;

      const draft: DraftData = JSON.parse(storedData);

      // Check if draft has expired
      if (Date.now() - draft.timestamp > DRAFT_EXPIRY_MS) {
        console.log('Draft expired, removing:', storageKey);
        localStorage.removeItem(storageKey);
        return null;
      }

      console.log('Draft loaded from localStorage:', storageKey);
      return draft;
    } catch (error) {
      console.error('Failed to load draft from localStorage:', error);
      return null;
    }
  }, [enabled, noteId, getStorageKey]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    try {
      const storageKey = getStorageKey(noteId);
      localStorage.removeItem(storageKey);
      console.log('Draft cleared from localStorage:', storageKey);
    } catch (error) {
      console.error('Failed to clear draft from localStorage:', error);
    }
  }, [noteId, getStorageKey]);

  // Auto-save draft whenever data changes
  useEffect(() => {
    if (enabled) {
      saveDraft(data);
    }
  }, [data.title, data.content, data.category, data.tags, enabled, saveDraft]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    loadDraft,
    clearDraft,
    saveDraft,
  };
}
