import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ProfilePage from '../page';
import useAuth from '@/lib/hooks/useAuth';
import useNotes from '@/lib/hooks/useNotes';

// Mock the hooks and router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/hooks/useAuth', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/hooks/useNotes', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/components/layout/PageContainer', () => ({
    __esModule: true,
    default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
      <div data-testid="page-container">
        <h1>{title}</h1>
        {children}
      </div>
    ),
}));

describe('ProfilePage Component', () => {
  const mockRouter = {
    push: jest.fn(),
  };
  
  const mockUser = {
    id: 'user1',
    email: 'test@example.com',
  };
  
  const mockSignOut = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: mockSignOut,
    });
    (useNotes as jest.Mock).mockReturnValue({
      notes: [{ id: 'note1' }, { id: 'note2' }],
    });
  });
  
  test('renders profile information', () => {
    render(<ProfilePage />);
    
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Note count
  });
  
  test('redirects to auth page if not logged in', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
    });
    
    render(<ProfilePage />);
    
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/auth');
    });
  });
  
  test('handles dark mode toggle', async () => {
    render(<ProfilePage />);
    
    const toggleButton = screen.getByRole('button', { name: /dark mode/i });
    
    await userEvent.click(toggleButton);
    
    // Check if localStorage was updated
    expect(localStorage.getItem('darkMode')).toBe('true');
  });
  
  test('handles sign out', async () => {
    render(<ProfilePage />);
    
    const signOutButton = screen.getByRole('button', { name: /sign out/i });
    
    await userEvent.click(signOutButton);
    
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});