import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import { supabase } from '@/lib/supabase/client';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
    },
  },
}));

describe('Google Authentication', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup router mock
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
    });
    
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost:3000',
      },
      writable: true,
    });
  });
  
  it('renders Google login button', () => {
    render(<GoogleLoginButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toBeInTheDocument();
  });
  
  it('calls supabase signInWithOAuth when clicked', async () => {
    // Mock successful response
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: {},
      error: null,
    });
    
    render(<GoogleLoginButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });
    
    // Click the button
    await userEvent.click(button);
    
    // Verify Supabase function was called with correct arguments
    await waitFor(() => {
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/auth/callback',
        },
      });
    });
  });
  
  it('shows loading state when authenticating', async () => {
    // Mock a delayed response to show loading state
    (supabase.auth.signInWithOAuth as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: {}, error: null }), 100))
    );
    
    render(<GoogleLoginButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });
    
    // Click the button
    await userEvent.click(button);
    
    // Button should be in loading state (disabled and without Google icon)
    expect(button).toBeDisabled();
    const googleIcon = screen.queryByTestId('google-icon');
    expect(googleIcon).not.toBeInTheDocument();
  });
  
  it('handles authentication errors', async () => {
    // Mock console.error to prevent test output pollution
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock error response
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: null,
      error: new Error('Authentication failed'),
    });
    
    // Mock window.alert
    const alertMock = jest.fn();
    global.alert = alertMock;
    
    render(<GoogleLoginButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });
    
    // Click the button
    await userEvent.click(button);
    
    // Verify error handling
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error signing in with Google:',
        expect.any(Error)
      );
      expect(alertMock).toHaveBeenCalledWith('Error signing in with Google. Please try again.');
    });
    
    // Clean up
    consoleErrorSpy.mockRestore();
  });
});