// src/components/auth/SignupForm.tsx
import { useState, useEffect } from 'react';
import useAuth from '@/lib/hooks/useAuth';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PasswordStrengthIndicator from '../ui/PasswordStrengthIndicator';
import { validatePassword } from '@/lib/utils/passwordValidator';
import GoogleLoginButton from './GoogleLoginButton';
import { useAnalytics } from '@/lib/analytics/useAnalytics';

export default function SignupForm() {
  const { signUp } = useAuth();
  const { track } = useAnalytics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    const checkFormValidity = () => {
      const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const { isValid: isPasswordValid } = validatePassword(password);
      const doPasswordsMatch = password === confirmPassword;
      
      setIsFormValid(isEmailValid && isPasswordValid && doPasswordsMatch && password.length > 0);
    };
    
    checkFormValidity();
  }, [email, password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid) {
      setError('Please correct the errors in the form');
      return;
    }
    
    // Track signup started
    track('signup_started', {
      subscription_status: 'free'
    });
    
    try {
      setIsLoading(true);
      setError('');
      await signUp(email, password);
      
      // Track signup completed
      track('signup_completed', {
        subscription_status: 'free'
      });
      
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Signup error:', error);
      setError(error.message || 'Failed to sign up');
      setSuccess(false); // Make sure success is false in case of error
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 text-green-700 bg-green-100 rounded-lg dark:bg-green-900 dark:text-green-200">
        <h3 className="text-lg font-medium">Check your email</h3>
        <p className="mt-2">
          We&apos;ve sent you an email with a link to confirm your account.
          Please check your inbox and click the link to complete the signup process.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        
        <div>
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <PasswordStrengthIndicator password={password} />
        </div>
        
        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          error={confirmPassword && password !== confirmPassword ? "Passwords don't match" : ""}
          required
        />
        
        <Button
          type="submit"
          fullWidth
          isLoading={isLoading}
          disabled={!isFormValid}
        >
          Create Account
        </Button>
      </form>
      
      <div className="flex items-center justify-center">
        <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
        <span className="px-3 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">or</span>
        <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
      </div>
      
      <GoogleLoginButton />
    </div>
  );
}