import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import useAuth from '@/lib/hooks/useAuth';

interface HeaderProps {
  /** Show the note search, a New note button and the profile menu (signed-in pages that opt in). */
  showActions?: boolean;
}

export default function Header({ showActions = false }: HeaderProps) {
  const { user, signOut } = useAuth();
  const withActions = showActions && !!user;
  // Phones: the search box opens in a row under the header
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div
        className={`flex items-center justify-between gap-4 h-16 px-4 mx-auto ${
          withActions ? 'lg:px-7' : 'container'
        }`}
      >
        <Link href="/" className="flex items-center shrink-0">
          <span className="text-xl font-bold text-primary-600 dark:text-primary-400">WardNotes</span>
        </Link>

        {withActions ? (
          <>
            <Suspense fallback={<div className="hidden md:block flex-1" />}>
              <HeaderSearch className="hidden md:flex flex-1 justify-center min-w-0" enableShortcut />
            </Suspense>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileSearchOpen((o) => !o)}
                aria-label={mobileSearchOpen ? 'Close search' : 'Search notes'}
                aria-expanded={mobileSearchOpen}
                aria-controls="mobile-search"
                className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-gray-600 hover:bg-gray-100
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  {mobileSearchOpen ? (
                    <path d="M6 6l12 12M18 6L6 18" />
                  ) : (
                    <>
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </>
                  )}
                </svg>
              </button>
              <Link
                href="/notes/new"
                className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-primary-600 text-white text-[15px] font-semibold
                  hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
                  dark:focus-visible:ring-offset-gray-800"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="hidden sm:inline">New note</span>
                <span className="sr-only sm:hidden">New note</span>
              </Link>
              <ProfileMenu
                initial={(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '?')
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
                onSignOut={signOut}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            {user ? (
              <button
                onClick={() => signOut()}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Sign Out
              </button>
            ) : (
              <Link
                href="/auth"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </div>
      {withActions && mobileSearchOpen && (
        <div id="mobile-search" className="px-4 pb-3 md:hidden">
          <Suspense fallback={null}>
            <HeaderSearch className="flex" autoFocus onSubmitted={() => setMobileSearchOpen(false)} />
          </Suspense>
        </div>
      )}
    </header>
  );
}

interface HeaderSearchProps {
  className?: string;
  autoFocus?: boolean;
  /** Let "/" focus this box from anywhere on the page. */
  enableShortcut?: boolean;
  onSubmitted?: () => void;
}

/**
 * Search box that opens the Library with the query (the Library has no search
 * box of its own). On the Library it shows the search being viewed.
 */
function HeaderSearch({ className = '', autoFocus = false, enableShortcut = false, onSubmitted }: HeaderSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQ = pathname === '/notes' ? searchParams?.get('q') ?? '' : '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(currentQ);

  // Follow the URL: a new search, or the Library clearing it
  useEffect(() => setQuery(currentQ), [currentQ]);

  useEffect(() => {
    if (!enableShortcut) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableShortcut]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/notes?q=${encodeURIComponent(q)}` : '/notes');
    inputRef.current?.blur();
    onSubmitted?.();
  };

  return (
    <form role="search" onSubmit={onSubmit} className={className}>
      <label className="relative block w-full max-w-xl">
        <span className="sr-only">Search notes</span>
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, labels, questions…"
          autoFocus={autoFocus}
          enterKeyHint="search"
          aria-keyshortcuts={enableShortcut ? '/' : undefined}
          className="w-full h-11 pl-10 pr-10 rounded-lg border border-gray-300 bg-gray-50 text-[15px] text-gray-900 placeholder:text-gray-500
            focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent focus:bg-white
            dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:ring-primary-400"
        />
        {enableShortcut && (
          <kbd
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 rounded border border-gray-300 text-xs text-gray-500 font-sans
              dark:border-gray-600 dark:text-gray-400"
          >
            /
          </kbd>
        )}
      </label>
    </form>
  );
}

/** Avatar button with a small menu: Profile, Settings, Sign out. */
function ProfileMenu({ initial, onSignOut }: { initial: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const itemClass =
    'block w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus-visible:bg-gray-700';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Profile and sign out"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-11 h-11 rounded-full border border-gray-200 bg-primary-100 text-primary-800 text-[15px] font-bold
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2
          dark:border-gray-600 dark:bg-primary-900 dark:text-primary-100 dark:focus-visible:ring-offset-gray-800"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 py-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-gray-800 dark:border-gray-700">
          <Link href="/profile" className={itemClass} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/settings" className={itemClass} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
