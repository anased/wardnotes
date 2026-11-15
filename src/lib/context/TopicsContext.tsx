'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Topic,
  TopicEdge,
  TopicInput,
  createTopic as createTopicQuery,
  deleteTopic as deleteTopicQuery,
  getTopicEdges,
  getTopicNoteCounts,
  getTopics,
  updateTopic as updateTopicQuery,
} from '../supabase/topics';
import { TopicGraph, buildTopicGraph, parentIds } from '../utils/topicTree';
import { useAuth } from './AuthContext';

interface TopicsContextType {
  topics: Topic[];
  edges: TopicEdge[];
  graph: TopicGraph<Topic>;
  /** Notes linked directly to each topic. */
  noteCounts: Record<string, number>;
  loading: boolean;
  error: Error | null;
  /** Reloads topics, edges and counts. */
  refresh: () => Promise<void>;
  /** Reloads only the note counts (after notes are linked or unlinked). */
  refreshCounts: () => Promise<void>;
  createTopic: (input: TopicInput) => Promise<Topic>;
  updateTopic: (id: string, input: TopicInput) => Promise<Topic>;
  deleteTopic: (id: string) => Promise<void>;
}

const TopicsContext = createContext<TopicsContextType | undefined>(undefined);

export function TopicsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [edges, setEdges] = useState<TopicEdge[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setTopics([]);
      setEdges([]);
      setNoteCounts({});
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [t, e, c] = await Promise.all([getTopics(), getTopicEdges(), getTopicNoteCounts()]);
      setTopics(t);
      setEdges(e);
      setNoteCounts(c);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error loading topics:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshCounts = useCallback(async () => {
    if (!user) return;
    try {
      setNoteCounts(await getTopicNoteCounts());
    } catch (err) {
      console.error('Error loading topic note counts:', err);
    }
  }, [user]);

  useEffect(() => {
    const currentUserId = user?.id || null;
    if (currentUserId !== lastUserIdRef.current) {
      lastUserIdRef.current = currentUserId;
      refresh();
    }
  }, [user, refresh]);

  const graph = useMemo(() => buildTopicGraph(topics, edges), [topics, edges]);

  const createTopic = useCallback(
    async (input: TopicInput) => {
      const topic = await createTopicQuery(input);
      await refresh();
      return topic;
    },
    [refresh]
  );

  const updateTopic = useCallback(
    async (id: string, input: TopicInput) => {
      const topic = await updateTopicQuery(id, input, parentIds(graph, id));
      await refresh();
      return topic;
    },
    [graph, refresh]
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      await deleteTopicQuery(id);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      topics,
      edges,
      graph,
      noteCounts,
      loading,
      error,
      refresh,
      refreshCounts,
      createTopic,
      updateTopic,
      deleteTopic,
    }),
    [topics, edges, graph, noteCounts, loading, error, refresh, refreshCounts, createTopic, updateTopic, deleteTopic]
  );

  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopics() {
  const context = useContext(TopicsContext);
  if (context === undefined) {
    throw new Error('useTopics must be used within a TopicsProvider');
  }
  return context;
}
