import { renderHook, act, waitFor } from '@testing-library/react';
import useCategories from '../useCategories';
import * as client from '../../supabase/client';

// Mock the client functions used by the hook
jest.mock('../../supabase/client', () => ({
  getCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
}));

describe('useCategories hook', () => {
  const mockCategories = [
    { id: '1', user_id: 'user1', name: 'Cardiology', color: 'red', created_at: '2025-05-01' },
    { id: '2', user_id: 'user1', name: 'Neurology', color: 'blue', created_at: '2025-05-01' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (client.getCategories as jest.Mock).mockResolvedValue(mockCategories);
  });

  test('fetches categories on mount', async () => {
    const { result } = renderHook(() => useCategories());
    
    expect(result.current.loading).toBe(true);
    
    // Replace waitForNextUpdate with waitFor
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(client.getCategories).toHaveBeenCalledTimes(1);
    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.error).toBe(null);
  });
  
  test('adds a new category', async () => {
    const newCategory = { 
      id: '3', 
      user_id: 'user1', 
      name: 'Pediatrics', 
      color: 'green', 
      created_at: '2025-05-01' 
    };
    
    (client.createCategory as jest.Mock).mockResolvedValue(newCategory);
    
    const { result } = renderHook(() => useCategories());
    
    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    act(() => {
      result.current.addCategory('Pediatrics', 'green');
    });
    
    expect(result.current.loading).toBe(true);
    
    // Wait for the addCategory operation to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(client.createCategory).toHaveBeenCalledWith('Pediatrics', 'green');
    expect(result.current.categories).toEqual([...mockCategories, newCategory]);
  });

  // Similar tests for editCategory and removeCategory
});