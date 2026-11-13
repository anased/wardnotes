/**
 * Pure helpers for the topic graph: topics nest Specialty → Domain → Topic →
 * Subtopic, and a topic may have several parents (it is still one topic).
 * Used by the sidebar tree, breadcrumbs, the topic picker and tests.
 */
import { normalizeTagName } from './tagUtils';

export interface TopicLike {
  id: string;
  name: string;
  aliases: string[];
}

export interface EdgeLike {
  parent_id: string;
  child_id: string;
}

export interface TopicGraph<T extends TopicLike = TopicLike> {
  byId: Map<string, T>;
  /** Parent ids of each topic, sorted by parent name. */
  parents: Map<string, string[]>;
  /** Child ids of each topic, sorted by child name. */
  children: Map<string, string[]>;
  /** Topics without a parent (specialties and loose topics), sorted by name. */
  roots: string[];
}

/** Trim and collapse spaces, as the database does for names. */
export const normalizeTopicName = normalizeTagName;

/** Lower-case, whitespace-normalized key used for every name comparison. */
export function topicKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export function buildTopicGraph<T extends TopicLike>(topics: T[], edges: EdgeLike[]): TopicGraph<T> {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const e of edges) {
    if (!byId.has(e.parent_id) || !byId.has(e.child_id)) continue;
    parents.set(e.child_id, [...(parents.get(e.child_id) ?? []), e.parent_id]);
    children.set(e.parent_id, [...(children.get(e.parent_id) ?? []), e.child_id]);
  }

  const sortIds = (ids: string[]) => ids.sort((a, b) => byName(byId.get(a)!.name, byId.get(b)!.name));
  parents.forEach(sortIds);
  children.forEach(sortIds);

  const roots = sortIds(topics.filter((t) => !parents.has(t.id)).map((t) => t.id));
  return { byId, parents, children, roots };
}

export function parentIds(graph: TopicGraph, id: string): string[] {
  return graph.parents.get(id) ?? [];
}

export function childIds(graph: TopicGraph, id: string): string[] {
  return graph.children.get(id) ?? [];
}

/** The topic and every topic below it (each once). */
export function descendantIds(graph: TopicGraph, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const c of childIds(graph, stack.pop()!)) {
      if (!seen.has(c)) {
        seen.add(c);
        stack.push(c);
      }
    }
  }
  return seen;
}

/** True when making `parentId` a parent of `childId` would create a cycle. */
export function wouldCreateCycle(graph: TopicGraph, parentId: string, childId: string): boolean {
  return descendantIds(graph, childId).has(parentId);
}

/**
 * Every path from a root to the topic, as lists of ids ending with the topic
 * itself. PRES under Cerebrovascular and Neurocritical care has two paths.
 * Capped so a very wide graph can't blow up.
 */
export function ancestorPaths(graph: TopicGraph, id: string, limit = 20): string[][] {
  const out: string[][] = [];
  const walk = (current: string, suffix: string[]) => {
    if (out.length >= limit) return;
    const path = [current, ...suffix];
    const ps = parentIds(graph, current).filter((p) => !path.includes(p));
    if (ps.length === 0) {
      out.push(path);
      return;
    }
    for (const p of ps) walk(p, path);
  };
  if (graph.byId.has(id)) walk(id, []);
  return out.sort((a, b) =>
    byName(a.map((x) => graph.byId.get(x)!.name).join('/'), b.map((x) => graph.byId.get(x)!.name).join('/'))
  );
}

export interface TopicMatch<T extends TopicLike = TopicLike> {
  topic: T;
  /** The alias that matched, or null when the name matched. */
  matchedAlias: string | null;
  /** 0 exact name, 1 exact alias, 2 name prefix, 3 alias prefix, 4 name contains, 5 alias contains. */
  rank: number;
}

/**
 * Matches topics by name and aliases, ignoring case: exact matches first,
 * then prefix, then substring. Mirrors search_topics() in the database so the
 * picker can answer instantly from the loaded topic list.
 */
export function matchTopics<T extends TopicLike>(topics: T[], query: string, limit = 20): TopicMatch<T>[] {
  const q = topicKey(query);
  if (!q) return [];

  const rankOf = (text: string, exact: number) => {
    const k = topicKey(text);
    if (k === q) return exact;
    if (k.startsWith(q)) return exact + 2;
    if (k.includes(q)) return exact + 4;
    return null;
  };

  const matches: TopicMatch<T>[] = [];
  for (const topic of topics) {
    let best: TopicMatch<T> | null = null;
    const nameRank = rankOf(topic.name, 0);
    if (nameRank !== null) best = { topic, matchedAlias: null, rank: nameRank };
    for (const alias of topic.aliases ?? []) {
      const r = rankOf(alias, 1);
      if (r !== null && (!best || r < best.rank)) best = { topic, matchedAlias: alias, rank: r };
    }
    if (best) matches.push(best);
  }

  return matches
    .sort((a, b) => a.rank - b.rank || byName(a.topic.name, b.topic.name))
    .slice(0, limit);
}

/** The topic whose name or alias equals `name` (ignoring case), if any. */
export function findTopicByName<T extends TopicLike>(topics: T[], name: string): T | undefined {
  const k = topicKey(name);
  if (!k) return undefined;
  return (
    topics.find((t) => topicKey(t.name) === k) ??
    topics.find((t) => (t.aliases ?? []).some((a) => topicKey(a) === k))
  );
}

/**
 * Tree rows for rendering, depth first. A topic with several parents appears
 * once under each expanded parent; `key` is the path, so it is unique.
 */
export interface TopicTreeRow {
  key: string;
  id: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** True when the topic has more than one parent. */
  multiParent: boolean;
}

export function flattenTree(
  graph: TopicGraph,
  expandedKeys: Set<string>,
  maxDepth = 12
): TopicTreeRow[] {
  const rows: TopicTreeRow[] = [];
  const visit = (id: string, parentKey: string, depth: number, onPath: Set<string>) => {
    const key = parentKey ? `${parentKey}/${id}` : id;
    const kids = childIds(graph, id).filter((c) => !onPath.has(c));
    const expanded = kids.length > 0 && expandedKeys.has(key);
    rows.push({
      key,
      id,
      depth,
      hasChildren: kids.length > 0,
      expanded,
      multiParent: parentIds(graph, id).length > 1,
    });
    if (expanded && depth < maxDepth) {
      const next = new Set(onPath).add(id);
      for (const c of kids) visit(c, key, depth + 1, next);
    }
  };
  for (const r of graph.roots) visit(r, '', 0, new Set());
  return rows;
}

/** Tree keys of every ancestor row on each path to `id`, so expanding them reveals it. */
export function expandKeysFor(graph: TopicGraph, id: string): string[] {
  const keys = new Set<string>();
  for (const path of ancestorPaths(graph, id)) {
    for (let i = 1; i < path.length; i++) keys.add(path.slice(0, i).join('/'));
  }
  return [...keys];
}
