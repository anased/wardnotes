import { createElement, ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useCategories from '../useCategories';
import { CategoriesProvider } from '../../context/CategoriesContext';
import * as client from '../../supabase/client';

// Mock the client functions used by the provider
jest.mock('../../supabase/client', () => ({
  getCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
}));

// The provider only fetches once a user is signed in
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user1' } }),
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(CategoriesProvider, null, children);

describe('useCategories hook', () => {
  const mockCategories = [
    { id: '1', user_id: 'user1', name: 'Cardiology', color: 'red', created_at: '2025-05-01' },
    { id: '2', user_id: 'user1', name: 'Neurology', color: 'blue', created_at: '2025-05-01' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (client.getCategories as jest.Mock).mockResolvedValue(mockCategories);
  });

  test('throws when used outside a CategoriesProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCategories())).toThrow(
      'useCategories must be used within a CategoriesProvider'
    );
    spy.mockRestore();
  });

  test('fetches categories on mount', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });

    expect(result.current.loading).toBe(true);

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
      created_at: '2025-05-01',
    };

    (client.createCategory as jest.Mock).mockResolvedValue(newCategory);

    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addCategory('Pediatrics', 'green');
    });

    expect(client.createCategory).toHaveBeenCalledWith('Pediatrics', 'green');
    expect(result.current.categories).toEqual([...mockCategories, newCategory]);
  });

  test('removes a category', async () => {
    (client.deleteCategory as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.removeCategory('1');
    });

    expect(client.deleteCategory).toHaveBeenCalledWith('1');
    expect(result.current.categories).toEqual([mockCategories[1]]);
  });
});
