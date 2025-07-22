import { useState, KeyboardEvent, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string;
  suggestions?: string[];
}

export interface TagInputHandle {
  focus: () => void;
}

const TagInput = forwardRef<TagInputHandle, TagInputProps>(
  ({ label, value = [], onChange, error, suggestions = [] }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSelectingSuggestion, setIsSelectingSuggestion] = useState(false); // New state to track suggestion selection
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    useEffect(() => {
      // Filter suggestions based on input value
      if (inputValue.trim() && suggestions.length > 0) {
        const filtered = suggestions.filter(
          suggestion => 
            suggestion.toLowerCase().includes(inputValue.toLowerCase()) && 
            !value.includes(suggestion)
        );
        setFilteredSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } else {
        setFilteredSuggestions([]);
        setShowSuggestions(false);
      }
    }, [inputValue, suggestions, value]);

    // Handle clicks outside the suggestions dropdown to close it
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          suggestionsRef.current && 
          !suggestionsRef.current.contains(event.target as Node) && 
          inputRef.current && 
          !inputRef.current.contains(event.target as Node)
        ) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      setIsSelectingSuggestion(false); // Reset selection flag when user types
      if (e.target.value.trim()) {
        setShowSuggestions(true);
      }
    };

    const addTag = (tag: string) => {
      tag = tag.trim();
      if (!tag) return;
      
      // Don't add duplicate tags
      if (!value.includes(tag)) {
        onChange([...value, tag]);
      }
      
      setInputValue('');
      setShowSuggestions(false);
      setIsSelectingSuggestion(false); // Reset selection flag
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

      // Close suggestions on Escape
      if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    };

    const handleBlur = () => {
      // Only add tag on blur if user is not selecting a suggestion and there's input
      if (!isSelectingSuggestion && inputValue.trim()) {
        addTag(inputValue);
      }
      
      // Don't hide suggestions immediately to allow clicking on them
      setTimeout(() => {
        if (!suggestionsRef.current?.contains(document.activeElement)) {
          setShowSuggestions(false);
          setIsSelectingSuggestion(false);
        }
      }, 200);
    };

    const handleSuggestionClick = (suggestion: string) => {
      setIsSelectingSuggestion(true); // Set flag before adding tag
      addTag(suggestion);
      inputRef.current?.focus();
    };

    // Handle mousedown on suggestions to prevent blur from interfering
    const handleSuggestionMouseDown = (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent blur from being triggered
      setIsSelectingSuggestion(true);
    };

    return (
      <div className="mb-4">
        {label && (
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
        )}
        
        <div className="relative">
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
              onFocus={() => inputValue && setShowSuggestions(true)}
              placeholder={value.length === 0 ? "Add tags (press Enter or comma to add)" : ""}
              className="flex-1 min-w-[120px] outline-none bg-transparent"
            />
          </div>
          
          {/* Suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div 
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg dark:bg-gray-800 dark:border-gray-700"
            >
              <ul className="py-1 max-h-60 overflow-auto">
                {filteredSuggestions.map((suggestion) => (
                  <li 
                    key={suggestion}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onMouseDown={handleSuggestionMouseDown} // Prevent blur on mousedown
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
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