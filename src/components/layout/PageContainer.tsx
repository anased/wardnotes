import { ReactNode } from 'react';
import Header from './Header';
import MobileNav from './MobileNav';
import useAuth from '@/lib/hooks/useAuth';
import { usePathname } from 'next/navigation';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  showMobileNav?: boolean;
}

export default function PageContainer({ 
  children, 
  title, 
  showMobileNav = true 
}: PageContainerProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  
  // Don't show mobile nav on auth pages or landing page
  const shouldShowMobileNav = showMobileNav && user && pathname !== '/' && !pathname?.startsWith('/auth');

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-1 py-6 pb-20">
        <div className="container px-4 mx-auto">
          {title && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{title}</h1>
            </div>
          )}
          
          {children}
        </div>
      </main>
      
      {shouldShowMobileNav && <MobileNav />}
    </div>
  );
}