'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { FlashcardService } from '@/services/flashcard';
import TopicTree from '@/components/topics/TopicTree';
import NoteTypeIcon from '@/components/notes/NoteTypeIcon';
import { READING_CHANGED_EVENT, countToRead } from '@/lib/supabase/articleReads';

/** Flashcards due now, loaded once per mount; null until known or on error. */
function useDueCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    FlashcardService.getDueCount()
      .then((n) => !cancelled && setCount(n))
      .catch((err) => console.error('Error loading due flashcards:', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

/** Articles still marked "To read"; refreshes when the Reading list changes. Null until known or on error. */
function useToReadCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      countToRead()
        .then((n) => !cancelled && setCount(n))
        // Before the Deep Read migration is applied the table doesn't exist: no badge.
        .catch(() => !cancelled && setCount(null));
    load();
    window.addEventListener(READING_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(READING_CHANGED_EVENT, load);
    };
  }, []);
  return count;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  isActive: (pathname: string, status: string | null) => boolean;
  badge?: number | null;
  /** Screen-reader word after the badge number, e.g. "due". */
  badgeLabel?: string;
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Desktop navigation shown beside the page (phones use the bottom MobileNav). */
export default function AppSidebar() {
  const dueCount = useDueCount();
  const toReadCount = useToReadCount();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const status = searchParams?.get('status') ?? null;
  // The topic being viewed: its page, or the Library filtered to it.
  const selectedTopic =
    pathname.match(/^\/topics\/([^/]+)/)?.[1] ?? (pathname === '/notes' ? searchParams?.get('topic') || null : null);
  const onTrials = pathname.startsWith('/trials');

  const items: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Home',
      isActive: (p) => p === '/dashboard',
      icon: (
        <svg {...iconProps}>
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      ),
    },
    {
      href: '/notes',
      label: 'Library',
      isActive: (p, s) =>
        (p.startsWith('/notes') && !(p === '/notes' && s === 'unanswered') && p !== '/notes/new') ||
        p.startsWith('/topics'),
      icon: (
        <svg {...iconProps}>
          <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
          <path d="M19 19v2H6" />
        </svg>
      ),
    },
    {
      href: '/reading',
      label: 'Reading',
      isActive: (p) => p.startsWith('/reading'),
      badge: toReadCount,
      badgeLabel: 'to read',
      icon: (
        <svg {...iconProps}>
          <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
          <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      href: '/flashcards',
      label: 'Flashcards',
      isActive: (p) => p.startsWith('/flashcards'),
      badge: dueCount,
      badgeLabel: 'due',
      icon: (
        <svg {...iconProps}>
          <rect x="3" y="6" width="14" height="14" rx="2" />
          <path d="M7 3h12a2 2 0 0 1 2 2v12" />
        </svg>
      ),
    },
    {
      href: '/notes?status=unanswered',
      label: 'Incomplete notes',
      isActive: (p, s) => p === '/notes' && s === 'unanswered',
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      ),
    },
    {
      href: '/learning-tracker',
      label: 'Learning tracker',
      isActive: (p) => p.startsWith('/learning-tracker'),
      icon: (
        <svg {...iconProps}>
          <path d="M13 3L4 14h7l-1 7 9-11h-7z" />
        </svg>
      ),
    },
    {
      href: '/settings',
      label: 'Settings',
      isActive: (p) => p.startsWith('/settings'),
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col px-4 py-6">
      <nav aria-label="Main" className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.isActive(pathname, status);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 h-11 px-3.5 rounded-lg text-[15px] transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
                ${
                  active
                    ? 'bg-primary-100 text-primary-800 font-semibold dark:bg-primary-900/50 dark:text-primary-100'
                    : 'text-gray-700 font-medium hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-full bg-primary-600 text-white text-xs font-bold">
                  {item.badge > 99 ? '99+' : item.badge}
                  <span className="sr-only"> {item.badgeLabel}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <hr className="mx-1.5 my-3.5 border-gray-200 dark:border-gray-700" />

      <TopicTree selectedId={selectedTopic} variant="sidebar" />

      <hr className="mx-1.5 my-2.5 border-gray-200 dark:border-gray-700" />

      <Link
        href="/trials"
        aria-current={pathname === '/trials' ? 'page' : undefined}
        className={`flex items-center gap-2.5 h-10 px-3.5 rounded-lg text-sm font-medium transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400
          ${
            onTrials
              ? 'bg-primary-100 text-primary-800 font-semibold dark:bg-primary-900/50 dark:text-primary-100'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
      >
        <NoteTypeIcon type="trial" className="w-4 h-4" decorative />
        All trials
      </Link>
    </div>
  );
}
