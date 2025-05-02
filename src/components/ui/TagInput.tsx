import { useState, KeyboardEvent, forwardRef, useImperativeHandle, useRef } from 'react';

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}

export interface TagInputHandle {
  focus: () => void;
}

const TagInput = forwardRef<TagInputHandle, TagInputProps>(
  ({ label, value = [], onChange, error }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const addTag = (tag: string) => {
      tag = tag.trim();
      if (!tag) return;
      
      // Don't add duplicate tags
      if (!value.includes(tag)) {
        onChange([...value, tag]);
      }
      
      setInputValue('');
    };

    const removeTag = (tagToRemove: string) => {
      onChange(value.filter((tag) => tag !== tagToRemove));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      // Add tag on Enter or comma
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(inputValue);
      }
      
      // Remove last tag on Backspace if input is empty
      if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    };

    const handleBlur = () => {
      // Add tag on blur if there's input
      if (inputValue) {
        addTag(inputValue);
      }
    };

    return (
      <div className="mb-4">
        {label && (
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
        )}
        
        <div 
          className={`flex flex-wrap items-center gap-2 p-2 border rounded-lg border-gray-300 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 dark:border-gray-700 dark:focus-within:border-primary-500 ${
            error ? 'border-red-500' : ''
          }`}
        >
          {value.map((tag) => (
            <div
              key={tag}
              className="flex items-center px-2 py-1 text-sm bg-gray-200 rounded-full dark:bg-gray-700"
            >
              <span className="mr-1">{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                &times;
              </button>
            </div>
          ))}
          
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? "Add tags (press Enter or comma to add)" : ""}
            className="flex-1 min-w-[120px] outline-none bg-transparent"
          />
        </div>
        
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

TagInput.displayName = 'TagInput';

export default TagInput;