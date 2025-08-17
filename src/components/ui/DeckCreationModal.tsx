// src/components/ui/DeckCreationModal.tsx
import React, { useState } from 'react';
import Input from './Input';
import Button from './Button';

interface DeckCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, color: string) => Promise<void>;
}

// Color options matching the app's color palette
const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#10B981', label: 'Green' },
  { value: '#EF4444', label: 'Red' },
  { value: '#F59E0B', label: 'Yellow' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6366F1', label: 'Indigo' },
  { value: '#6B7280', label: 'Gray' },
];

export default function DeckCreationModal({ 
  isOpen, 
  onClose, 
  onSave 
}: DeckCreationModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Deck name is required');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError('');
      await onSave(name, description, color);
      
      // Reset form values
      setName('');
      setDescription('');
      setColor('#3B82F6');
      
      // Close modal
      onClose();
    } catch (err) {
      const error = err as Error;
      console.error('Error creating deck:', error);
      setError(error.message || 'Failed to create deck');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Create New Deck</h3>
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
            label="Deck Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Cardiology, Anatomy, USMLE Step 1"
            required
          />
          
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this deck contains"
              rows={2}
              className="input resize-none"
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((colorOption) => (
                <button
                  key={colorOption.value}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === colorOption.value 
                      ? 'border-gray-800 dark:border-white scale-110' 
                      : 'border-gray-300 dark:border-gray-600'
                  } transition-all`}
                  style={{ 
                    backgroundColor: colorOption.value 
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
              Create Deck
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}