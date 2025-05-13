// src/components/ui/CategoryCreationModal.tsx (Fixed Version)
import React, { useState } from 'react';
import Input from './Input';
import Button from './Button';

interface CategoryCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}

// Color options matching the app's color palette
const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'gray', label: 'Gray' },
];

// Helper function to convert color name to hex value
const getColorHex = (colorName: string): string => {
  switch (colorName) {
    case 'blue': return '#3b82f6';
    case 'red': return '#ef4444';
    case 'green': return '#10b981';
    case 'yellow': return '#f59e0b';
    case 'purple': return '#8b5cf6';
    case 'pink': return '#ec4899';
    case 'indigo': return '#6366f1';
    case 'gray': return '#6b7280';
    default: return '#3b82f6'; // Default to blue
  }
};

export default function CategoryCreationModal({ 
  isOpen, 
  onClose, 
  onSave 
}: CategoryCreationModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Category name is required');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError('');
      await onSave(name, color);
      
      // Reset form values
      setName('');
      setColor('blue');
      
      // Close modal
      onClose();
    } catch (err) {
      const error = err as Error;
      console.error('Error creating category:', error);
      setError(error.message || 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Create New Category</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
        
        <div className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
              {error}
            </div>
          )}
          
          <Input
            label="Category Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter category name"
            required
          />
          
          <div className="mb-4">
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((colorOption) => (
                <button
                  key={colorOption.value}
                  type="button"
                  className={`w-8 h-8 rounded-full ${
                    color === colorOption.value ? 'ring-2 ring-offset-2 ring-primary-500' : ''
                  }`}
                  style={{ 
                    backgroundColor: getColorHex(colorOption.value) 
                  }}
                  onClick={() => setColor(colorOption.value)}
                  title={colorOption.label}
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={isSubmitting}
              onClick={handleSubmit}
            >
              Create Category
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}