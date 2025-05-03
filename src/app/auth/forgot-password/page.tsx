// src/app/auth/forgot-password/page.tsx
'use client';

import Link from 'next/link';
import PageContainer from '@/components/layout/PageContainer';
import PasswordResetRequestForm from '@/components/auth/PasswordResetRequestForm';

export default function ForgotPasswordPage() {
  return (
    <PageContainer showMobileNav={false}>
      <div className="container max-w-md px-4 py-8 mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Reset Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            WardNotes
          </p>
        </div>
        
        <div className="overflow-hidden bg-white rounded-lg shadow-sm dark:bg-gray-800">
          <div className="p-6">
            <PasswordResetRequestForm />
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <Link href="/auth" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
            &larr; Back to Sign In
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}