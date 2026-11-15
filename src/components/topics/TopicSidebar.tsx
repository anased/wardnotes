import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useTopics from '@/lib/hooks/useTopics';
import TopicTree from './TopicTree';
import NoteTypeIcon from '../notes/NoteTypeIcon';
import { ChevronDownIcon } from './icons';

interface TopicSidebarProps {
  selectedId?: string | null;
  /** See TopicTree: without it, topics link to their page. */
  onSelect?: (id: string | null) => void;
}

/**
 * The notes-area topic tree: a sticky sidebar on large screens and a
 * collapsible panel above the content on small ones. Place it as the first
 * child of a `lg:grid-cols-[16rem_minmax(0,1fr)]` grid.
 */
export default function TopicSidebar({ selectedId = null, onSelect }: TopicSidebarProps) {
  const { graph } = useTopics();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const selected = selectedId ? graph.byId.get(selectedId) : undefined;

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="notes-topic-tree"
          className="flex items-center justify-between w-full text-sm font-semibold tracking-wide text-gray-500 uppercase lg:hidden dark:text-gray-400"
        >
          <span>
            Topics
            {selected && (
              <span className="ml-2 font-normal tracking-normal normal-case text-primary-700 dark:text-primary-300">
                {selected.name}
              </span>
            )}
          </span>
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <div id="notes-topic-tree" className={`${open ? 'mt-3' : 'hidden'} lg:block lg:mt-0`}>
          <TopicTree selectedId={selectedId} onSelect={onSelect} hideHeadingOnMobile />
          <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/trials"
              aria-current={pathname === '/trials' ? 'page' : undefined}
              className={`flex items-center gap-2 px-1.5 py-1 text-sm rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                pathname?.startsWith('/trials')
                  ? 'bg-primary-50 text-primary-800 font-medium dark:bg-primary-900/60 dark:text-primary-100'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <NoteTypeIcon type="trial" className="w-4 h-4" decorative />
              All trials
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
