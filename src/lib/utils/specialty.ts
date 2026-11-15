/**
 * A note's specialty is the top-level (root) topic of its primary topic.
 * PRES under Neurology > Cerebrovascular → Neurology.
 */
import { TopicGraph, ancestorPaths, topicKey } from './topicTree';

export interface TopicLinkLike {
  topic_id: string;
  is_primary: boolean;
}

export interface Specialty {
  name: string;
  /** Root topic id. */
  topicId: string;
}

/** The primary link's topic id, else the first link's (a note should always have a primary). */
export function primaryTopicId(links: TopicLinkLike[] | null | undefined): string | undefined {
  if (!links || links.length === 0) return undefined;
  return (links.find((l) => l.is_primary) ?? links[0]).topic_id;
}

/** Root topic above `topicId` (first ancestor path when there are several; itself when it is a root). */
export function rootTopicId(graph: TopicGraph, topicId: string): string | undefined {
  return ancestorPaths(graph, topicId)[0]?.[0];
}

/**
 * Specialty for a note: the root of its primary topic. Null for a note
 * without topics, or while the topics haven't loaded yet.
 */
export function noteSpecialty(
  graph: TopicGraph,
  note: { note_topics?: TopicLinkLike[] | null }
): Specialty | null {
  const topicId = primaryTopicId(note.note_topics);
  const root = topicId ? rootTopicId(graph, topicId) : undefined;
  return root ? { name: graph.byId.get(root)!.name, topicId: root } : null;
}

/** Root topic whose name matches `name` (case-insensitive); used for old `?category=` links. */
export function rootTopicByName(graph: TopicGraph, name: string): string | undefined {
  const k = topicKey(name);
  if (!k) return undefined;
  return graph.roots.find((id) => topicKey(graph.byId.get(id)!.name) === k);
}
