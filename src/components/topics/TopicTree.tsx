import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useTopics from '@/lib/hooks/useTopics';
import { expandKeysFor, flattenTree, parentIds } from '@/lib/utils/topicTree';
import { ChevronRightIcon, LinkIcon, PlusIcon } from './icons';
import TopicFormModal from './TopicFormModal';

const STORAGE_KEY = 'wardnotes.topicTree.expanded';

interface TopicTreeProps {
  /** Highlighted topic (the current filter or page). */
  selectedId?: string | null;
  /**
   * Called when a topic is clicked. Without it, topics link to their page.
   * Clicking the selected topic again passes null.
   */
  onSelect?: (id: string | null) => void;
  /** Show the heading row with the "New" button. */
  showHeader?: boolean;
  /** Hide the "Topics" heading below the lg breakpoint (when a toggle already shows it). */
  hideHeadingOnMobile?: boolean;
}

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

/**
 * Collapsible topic tree. A topic with several parents (PRES under
 * Cerebrovascular and Neurocritical care) is listed under each of them with a
 * small link icon. Expanded branches are remembered on this device.
 */
export default function TopicTree({
  selectedId = null,
  onSelect,
  showHeader = true,
  hideHeadingOnMobile = false,
}: TopicTreeProps) {
  const { topics, graph, noteCounts, loading, error } = useTopics();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showCreate, setShowCreate] = useState(false);

  // Restore after mount (localStorage isn't available during SSR)
  useEffect(() => setExpanded(loadExpanded()), []);

  // Reveal the selected topic wherever it appears
  useEffect(() => {
    if (!selectedId || !graph.byId.has(selectedId)) return;
    const keys = expandKeysFor(graph, selectedId);
    setExpanded((prev) => (keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys])));
  }, [selectedId, graph]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]));
    } catch {
      // Storage full or blocked: expansion just isn't remembered
    }
  }, [expanded]);

  const rows = useMemo(() => flattenTree(graph, expanded), [graph, expanded]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const otherParents = (id: string, rowKey: string) => {
    const keyParts = rowKey.split('/');
    const shownUnder = keyParts[keyParts.length - 2];
    return parentIds(graph, id)
      .filter((p) => p !== shownUnder)
      .map((p) => graph.byId.get(p)?.name)
      .join(', ');
  };

  const rowClass = (id: string) =>
    `flex items-center flex-1 min-w-0 gap-1.5 px-1.5 py-1 text-sm text-left rounded-md transition-colors
     focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
     ${
       id === selectedId
         ? 'bg-primary-50 text-primary-800 font-medium dark:bg-primary-900/60 dark:text-primary-100'
         : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
     }`;

  return (
    <nav aria-label="Topics">
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <h2
            className={`text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400 ${
              hideHeadingOnMobile ? 'sr-only lg:not-sr-only' : ''
            }`}
          >
            Topics
          </h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 ml-auto text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        </div>
      )}

      {loading && topics.length === 0 ? (
        <div className="flex justify-center py-4" role="status" aria-label="Loading topics">
          <div className="w-5 h-5 border-4 rounded-full border-primary-500 border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Couldn&apos;t load topics right now.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No topics yet. Create a specialty such as Neurology, then add domains and topics under it.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((row) => {
            const topic = graph.byId.get(row.id)!;
            const count = noteCounts[row.id] ?? 0;
            const also = row.multiParent ? otherParents(row.id, row.key) : '';
            const content = (
              <>
                <span className="truncate">{topic.name}</span>
                {row.multiParent && (
                  <span
                    className="flex-shrink-0 text-gray-400 dark:text-gray-500"
                    title={also ? `Also in: ${also}` : 'Has several parents'}
                  >
                    <LinkIcon />
                    <span className="sr-only">{also ? `, also in ${also}` : ', has several parents'}</span>
                  </span>
                )}
                {count > 0 && (
                  <span className="ml-auto pl-1 text-xs font-normal text-gray-500 tabular-nums dark:text-gray-400">
                    {count}
                  </span>
                )}
              </>
            );

            return (
              <li key={row.key} className="flex items-center" style={{ paddingLeft: `${row.depth * 0.875}rem` }}>
                {row.hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(row.key)}
                    aria-expanded={row.expanded}
                    aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${topic.name}`}
                    className="flex items-center justify-center flex-shrink-0 w-5 h-5 text-gray-500 rounded hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform ${row.expanded ? 'rotate-90' : ''}`} />
                  </button>
                ) : (
                  <span className="flex-shrink-0 w-5" aria-hidden="true" />
                )}
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row.id === selectedId ? null : row.id)}
                    aria-pressed={row.id === selectedId}
                    className={rowClass(row.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    href={`/topics/${row.id}`}
                    aria-current={row.id === selectedId ? 'page' : undefined}
                    className={rowClass(row.id)}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <TopicFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        defaultParentIds={selectedId ? [selectedId] : []}
      />
    </nav>
  );
}
