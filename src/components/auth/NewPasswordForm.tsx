// src/components/auth/NewPasswordForm.tsx
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PasswordStrengthIndicator from '../ui/PasswordStrengthIndicator';
import { validatePassword } from '@/lib/utils/passwordValidator';

export default function NewPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkFormValidity = () => {
      const { isValid: isPasswordValid } = validatePassword(password);
      const doPasswordsMatch = password === confirmPassword;
      
      setIsFormValid(isPasswordValid && doPasswordsMatch && password.length > 0);
    };
    
    checkFormValidity();
  }, [password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid) {
      setError('Please correct the errors in the form');
      return;
    }
    
    try {
      setIsLoading(true);
      setError('');
      
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) throw error;
      
      setSuccess(true);
      // Redirect to login after a delay
      setTimeout(() => {
        router.push('/auth');
      }, 3000);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Password update error:', error);
      setError(error.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 text-green-700 bg-green-100 rounded-lg dark:bg-green-900 dark:text-green-200">
        <h3 className="text-lg font-medium">Password Updated Successfully</h3>
        <p className="mt-2">
          Your password has been updated. You will be redirected to the login page shortly.
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
      
      <div>
        <Input
          label="New Password"
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
        label="Confirm New Password"
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
        Set New Password
      </Button>
    </form>
  );
}