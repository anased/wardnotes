// src/components/auth/PasswordResetRequestForm.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function PasswordResetRequestForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    try {
      setIsLoading(true);
      setError('');
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      
      if (error) throw error;
      
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Password reset error:', error);
      setError(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 text-green-700 bg-green-100 rounded-lg dark:bg-green-900 dark:text-green-200">
        <h3 className="text-lg font-medium">Check your email</h3>
        <p className="mt-2">
          We&apos;ve sent you an email with a link to reset your password.
          Please check your inbox and click the link to continue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      <p className="text-gray-600 dark:text-gray-400">
        Enter your email address and we'll send you a link to reset your password.
      </p>
      
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      
      <Button
        type="submit"
        fullWidth
        isLoading={isLoading}
      >
        Send Reset Link
      </Button>
    </form>
  );
}