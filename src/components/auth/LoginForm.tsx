import { useState } from 'react';
import useAuth from '@/lib/hooks/useAuth';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Link from 'next/link';

export default function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    try {
      setIsLoading(true);
      setError('');
      await signIn(email, password);
      // Navigation is handled in the useAuth hook
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Login error:', error);
      setError(error.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      <div className="flex justify-end mt-1 mb-4">
        <Link href="/auth/forgot-password" className="text-sm text-primary-600 hover:underline dark:text-primary-400">
          Forgot password?
        </Link>
      </div>
      <Button
        type="submit"
        fullWidth
        isLoading={isLoading}
      >
        Sign In
      </Button>
    </form>
  );
}