'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { FlashcardService } from '@/services/flashcard';

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

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  isActive: (pathname: string, status: string | null) => boolean;
  badge?: number | null;
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
  const pathname = usePathname() ?? '';
  const status = useSearchParams()?.get('status') ?? null;

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
        p.startsWith('/topics') ||
        p.startsWith('/trials'),
      icon: (
        <svg {...iconProps}>
          <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
          <path d="M19 19v2H6" />
        </svg>
      ),
    },
    {
      href: '/flashcards',
      label: 'Flashcards',
      isActive: (p) => p.startsWith('/flashcards'),
      badge: dueCount,
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
    <nav aria-label="Main" className="flex flex-col gap-1 px-4 py-6">
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
                <span className="sr-only"> due</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
