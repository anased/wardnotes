'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trial,
  TrialInput,
  TrialTopicLink,
  createTrial as createTrialQuery,
  deleteTrial as deleteTrialQuery,
  getTrials,
  updateTrial as updateTrialQuery,
} from '../supabase/trials';
import { useAuth } from './AuthContext';

interface TrialsContextType {
  trials: Trial[];
  byId: Map<string, Trial>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createTrial: (input: TrialInput, topics: TrialTopicLink[]) => Promise<Trial>;
  updateTrial: (id: string, input: TrialInput, topics?: TrialTopicLink[]) => Promise<Trial>;
  deleteTrial: (id: string) => Promise<void>;
}

const TrialsContext = createContext<TrialsContextType | undefined>(undefined);

/** The user's trial records, shared by the trial pages and pickers. */
export function TrialsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setTrials([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setTrials(await getTrials());
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error loading trials:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const currentUserId = user?.id || null;
    if (currentUserId !== lastUserIdRef.current) {
      lastUserIdRef.current = currentUserId;
      refresh();
    }
  }, [user, refresh]);

  const createTrial = useCallback(
    async (input: TrialInput, topics: TrialTopicLink[]) => {
      const trial = await createTrialQuery(input, topics);
      await refresh();
      return trial;
    },
    [refresh]
  );

  const updateTrial = useCallback(
    async (id: string, input: TrialInput, topics?: TrialTopicLink[]) => {
      const trial = await updateTrialQuery(id, input, topics);
      await refresh();
      return trial;
    },
    [refresh]
  );

  const deleteTrial = useCallback(
    async (id: string) => {
      await deleteTrialQuery(id);
      await refresh();
    },
    [refresh]
  );

  const byId = useMemo(() => new Map(trials.map((t) => [t.id, t])), [trials]);

  const value = useMemo(
    () => ({ trials, byId, loading, error, refresh, createTrial, updateTrial, deleteTrial }),
    [trials, byId, loading, error, refresh, createTrial, updateTrial, deleteTrial]
  );

  return <TrialsContext.Provider value={value}>{children}</TrialsContext.Provider>;
}

export function useTrials() {
  const context = useContext(TrialsContext);
  if (context === undefined) {
    throw new Error('useTrials must be used within a TrialsProvider');
  }
  return context;
}
