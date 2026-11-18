import { ReactNode } from 'react';
import Header from './Header';
import MobileNav from './MobileNav';
import useAuth from '@/lib/hooks/useAuth';
import { usePathname } from 'next/navigation';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  showMobileNav?: boolean;
  /**
   * Navigation shown in a left column on large screens. When set, the header
   * shows search / New note / profile, and the bottom MobileNav is limited to
   * small screens.
   */
  sidebar?: ReactNode;
}

export default function PageContainer({
  children,
  title,
  showMobileNav = true,
  sidebar,
}: PageContainerProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Don't show mobile nav on auth pages or landing page
  const shouldShowMobileNav = showMobileNav && user && pathname !== '/' && !pathname?.startsWith('/auth');

  const heading = title && (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Header showActions={!!sidebar} />

      {sidebar ? (
        <div className="flex flex-1 bg-gray-50 dark:bg-gray-900">
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-16">{sidebar}</div>
          </aside>
          <main className="flex-1 min-w-0 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pt-7 lg:pb-12">
            <div className="max-w-[1100px]">
              {heading}
              {children}
            </div>
          </main>
        </div>
      ) : (
        <main className="flex-1 py-6 pb-20">
          <div className="container px-4 mx-auto">
            {heading}
            {children}
          </div>
        </main>
      )}

      {shouldShowMobileNav && (
        <div className={sidebar ? 'lg:hidden' : undefined}>
          <MobileNav />
        </div>
      )}
    </div>
  );
}
