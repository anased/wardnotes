// src/lib/utils/relatedNotes.ts
import type { Note, NoteTopicRef } from '@/lib/supabase/client';
import { tagKey } from './tagUtils';
import { TopicGraph, childIds, parentIds } from './topicTree';

export const DEFAULT_RELATED_LIMIT = 5;

/**
 * Weights. Being filed under the same topic is the strongest signal, then
 * topics next to each other in the tree, then labels (tags). Specialty-level
 * (root) topics are broad, so sharing one counts for little and they are
 * never used as a "shared parent".
 */
export const RELATED_WEIGHTS = {
  sameTopic: 6,
  sameRootTopic: 1,
  /** Siblings, or one topic directly above/below the other. */
  near: 3,
  /** A shared non-root ancestor further up, or a topic further above/below. */
  far: 2,
  label: 1,
} as const;

export type TopicRelationKind = 'sibling' | 'broader' | 'narrower' | 'area';

export interface TopicRelation {
  kind: TopicRelationKind;
  /** The topic named in the description: the shared parent/ancestor, or the candidate's topic. */
  topicId: string;
  weight: number;
}

export interface RelatedNote {
  note: Note;
  /** Topics both notes are filed under. */
  sharedTopicIds: string[];
  /** Best relation between other topics of the two notes, when they share none (or only a root). */
  relation: TopicRelation | null;
  /** Tags (labels) the candidate shares with the source note, in the candidate's spelling. */
  sharedTags: string[];
  score: number;
}

type RelatableNote = Pick<Note, 'id' | 'tags'> & { note_topics?: NoteTopicRef[] };

/** Topics above `id` with their distance (1 = parent). */
function ancestorsWithDistance(graph: TopicGraph, id: string): Map<string, number> {
  const out = new Map<string, number>();
  let frontier = [id];
  for (let d = 1; frontier.length && d < 50; d++) {
    const next: string[] = [];
    for (const t of frontier) {
      for (const p of parentIds(graph, t)) {
        if (!out.has(p) && p !== id) {
          out.set(p, d);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return out;
}

const isRoot = (graph: TopicGraph, id: string) => parentIds(graph, id).length === 0;

/** How topic `c` (candidate) relates to topic `s` (source), if they are near each other in the tree. */
export function topicRelation(graph: TopicGraph, s: string, c: string): TopicRelation | null {
  if (s === c || !graph.byId.has(s) || !graph.byId.has(c)) return null;
  const sAnc = ancestorsWithDistance(graph, s);
  const cAnc = ancestorsWithDistance(graph, c);

  // c above s (but not a specialty): a broader topic
  if (sAnc.has(c) && !isRoot(graph, c)) {
    return { kind: 'broader', topicId: c, weight: sAnc.get(c) === 1 ? RELATED_WEIGHTS.near : RELATED_WEIGHTS.far };
  }
  // c below s (s not a specialty): a subtopic
  if (cAnc.has(s) && !isRoot(graph, s)) {
    return { kind: 'narrower', topicId: c, weight: cAnc.get(s) === 1 ? RELATED_WEIGHTS.near : RELATED_WEIGHTS.far };
  }
  // Nearest shared ancestor that isn't a specialty
  let best: { id: string; d: number } | null = null;
  sAnc.forEach((ds, a) => {
    const dc = cAnc.get(a);
    if (dc === undefined || isRoot(graph, a)) return;
    const d = Math.max(ds, dc);
    if (!best || d < best.d) best = { id: a, d };
  });
  if (!best) return null;
  const { id, d } = best as { id: string; d: number };
  return d === 1
    ? { kind: 'sibling', topicId: id, weight: RELATED_WEIGHTS.near }
    : { kind: 'area', topicId: id, weight: RELATED_WEIGHTS.far };
}

/**
 * Topic ids worth looking up candidates for: the note's topics, and for each
 * one every topic under its highest non-specialty ancestor (siblings,
 * subtopics, broader topics…). Specialties themselves only match exactly.
 */
export function relatedTopicIds(graph: TopicGraph, topicIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of topicIds) {
    if (!graph.byId.has(id)) continue;
    out.add(id);
    const tops = [id, ...ancestorsWithDistance(graph, id).keys()].filter(
      (a) => !isRoot(graph, a) && parentIds(graph, a).every((p) => isRoot(graph, p))
    );
    const visited = new Set<string>(tops);
    const stack = [...tops];
    while (stack.length) {
      const t = stack.pop()!;
      out.add(t);
      for (const c of childIds(graph, t)) {
        if (!visited.has(c)) {
          visited.add(c);
          stack.push(c);
        }
      }
    }
  }
  return [...out];
}

/**
 * Ranks `candidates` by how related they are to `source`: shared topics
 * first, then topics next to each other (same parent, broader/narrower),
 * then shared labels, then most recent. Excludes the source note itself and
 * any candidate with nothing in common. Label matching ignores case.
 */
export function rankRelatedNotes(
  source: RelatableNote,
  candidates: Note[],
  graph: TopicGraph,
  limit: number = DEFAULT_RELATED_LIMIT
): RelatedNote[] {
  const sourceTagKeys = new Set((source.tags || []).map(tagKey));
  const sourceTopics = [...new Set((source.note_topics || []).map((l) => l.topic_id))].filter((id) =>
    graph.byId.has(id)
  );
  const seen = new Set<string>([source.id]);
  const ranked: RelatedNote[] = [];

  for (const note of candidates) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);

    const candidateTopics = [...new Set((note.note_topics || []).map((l) => l.topic_id))].filter((id) =>
      graph.byId.has(id)
    );
    const sharedTopicIds = sourceTopics.filter((id) => candidateTopics.includes(id));
    let score = sharedTopicIds.reduce(
      (sum, id) => sum + (isRoot(graph, id) ? RELATED_WEIGHTS.sameRootTopic : RELATED_WEIGHTS.sameTopic),
      0
    );

    let relation: TopicRelation | null = null;
    if (!sharedTopicIds.some((id) => !isRoot(graph, id))) {
      for (const s of sourceTopics) {
        for (const c of candidateTopics) {
          if (sharedTopicIds.includes(c)) continue;
          const r = topicRelation(graph, s, c);
          if (r && (!relation || r.weight > relation.weight)) relation = r;
        }
      }
      if (relation) score += relation.weight;
    }

    const sharedTags = (note.tags || []).filter((tag) => sourceTagKeys.has(tagKey(tag)));
    score += sharedTags.length * RELATED_WEIGHTS.label;

    if (score > 0) {
      ranked.push({ note, sharedTopicIds, relation, sharedTags, score });
    }
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.note.created_at).getTime() - new Date(a.note.created_at).getTime()
  );

  return ranked.slice(0, Math.max(0, limit));
}

const RELATION_LABELS: Record<TopicRelationKind, string> = {
  sibling: 'same parent',
  broader: 'broader topic',
  narrower: 'subtopic',
  area: 'same area',
};

/**
 * Why a note is related, e.g. "shared topic PRES · 1 shared label" or
 * "same parent: Cerebrovascular".
 */
export function describeRelatedNote(item: RelatedNote, graph: TopicGraph): string {
  const name = (id: string) => graph.byId.get(id)?.name ?? 'topic';
  const parts: string[] = [];
  if (item.sharedTopicIds.length > 0) {
    const names = item.sharedTopicIds.map(name);
    parts.push(`shared topic${names.length === 1 ? '' : 's'} ${names.join(', ')}`);
  }
  if (item.relation) {
    parts.push(`${RELATION_LABELS[item.relation.kind]}: ${name(item.relation.topicId)}`);
  }
  if (item.sharedTags.length > 0) {
    parts.push(`${item.sharedTags.length} shared label${item.sharedTags.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}
