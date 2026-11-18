import { ReactNode, Suspense } from 'react';
import Header from './Header';
import MobileNav from './MobileNav';
import AppSidebar from './AppSidebar';
import useAuth from '@/lib/hooks/useAuth';
import { usePathname } from 'next/navigation';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  showMobileNav?: boolean;
}

/**
 * Page chrome. Signed-in app pages get the app layout: a header with search,
 * New note and the profile menu, the navigation sidebar on large screens and
 * the bottom MobileNav on small ones. The landing page and auth pages keep the
 * plain header and a centered container.
 */
export default function PageContainer({
  children,
  title,
  showMobileNav = true,
}: PageContainerProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isPublicPage = pathname === '/' || !!pathname?.startsWith('/auth');
  // Treat "still checking the session" as signed in so the layout doesn't jump
  // once auth resolves; signed-out users are redirected away from these pages.
  const appLayout = !isPublicPage && (!!user || loading);
  const shouldShowMobileNav = showMobileNav && !!user && !isPublicPage;

  // Page titles aren't shown (the sidebar already says where you are) but stay
  // as the page's heading for screen readers.
  const heading = title && <h1 className="sr-only">{title}</h1>;

  return (
    <div className="flex flex-col min-h-screen">
      <Header showActions={appLayout} />

      {appLayout ? (
        <div className="flex flex-1 bg-gray-50 dark:bg-gray-900">
          <aside className="hidden lg:block w-[17rem] shrink-0 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {/* AppSidebar reads search params; keep it from opting the page out of prerendering. */}
              <Suspense fallback={null}>{user && <AppSidebar />}</Suspense>
            </div>
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
        <div className="lg:hidden">
          <MobileNav />
        </div>
      )}
    </div>
  );
}
