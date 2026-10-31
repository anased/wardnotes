import { useState, KeyboardEvent, forwardRef, useImperativeHandle, useRef, useEffect, useId, useMemo } from 'react';
import { MAX_TAG_LENGTH, canonicalTagName, hasTag, normalizeTagName, tagKey, tagsEqual } from '@/lib/utils/tagUtils';

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
    const [showSuggestions, setShowSuggestions] = useState(false);
    // Index of the highlighted suggestion, or -1 when none is highlighted
    const [highlightedIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const baseId = useId();
    const inputId = `${baseId}-input`;
    const listboxId = `${baseId}-listbox`;
    const optionId = (index: number) => `${baseId}-option-${index}`;

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    // Suggestions matching the input, excluding tags already added.
    // Names that start with the input come first.
    const filteredSuggestions = useMemo(() => {
      const query = tagKey(inputValue);
      if (!query) return [];
      const matches = suggestions.filter(
        suggestion => tagKey(suggestion).includes(query) && !hasTag(value, suggestion)
      );
      const startsWith = matches.filter(s => tagKey(s).startsWith(query));
      const contains = matches.filter(s => !tagKey(s).startsWith(query));
      return [...startsWith, ...contains];
    }, [inputValue, suggestions, value]);

    const isOpen = showSuggestions && filteredSuggestions.length > 0;
    // Ignore a stale highlight if the list got shorter
    const activeIndex = highlightedIndex < filteredSuggestions.length ? highlightedIndex : -1;

    // Keep the highlighted suggestion visible when moving with the keyboard
    useEffect(() => {
      if (activeIndex < 0) return;
      const el = document.getElementById(optionId(activeIndex));
      el?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

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
      setShowSuggestions(true);
      setActiveIndex(-1);
    };

    const addTag = (rawTag: string) => {
      const normalized = normalizeTagName(rawTag);
      if (!normalized) return;

      // Use the existing spelling if this tag already exists ("chf" -> "CHF")
      const tag = canonicalTagName(normalized, suggestions).slice(0, MAX_TAG_LENGTH);

      // Don't add duplicate tags (case-insensitive)
      if (!hasTag(value, tag)) {
        onChange([...value, tag]);
      }

      setInputValue('');
      setShowSuggestions(false);
      setActiveIndex(-1);
    };

    const removeTag = (tagToRemove: string) => {
      onChange(value.filter((tag) => !tagsEqual(tag, tagToRemove)));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      // Let IME composition (e.g. Japanese input) finish before acting on keys
      if (e.nativeEvent.isComposing) return;

      switch (e.key) {
        case 'ArrowDown': {
          if (filteredSuggestions.length === 0) return;
          e.preventDefault();
          if (!isOpen) {
            setShowSuggestions(true);
            setActiveIndex(0);
          } else {
            setActiveIndex((activeIndex + 1) % filteredSuggestions.length);
          }
          return;
        }
        case 'ArrowUp': {
          if (!isOpen) return;
          e.preventDefault();
          setActiveIndex(activeIndex <= 0 ? filteredSuggestions.length - 1 : activeIndex - 1);
          return;
        }
        case 'Enter':
        case ',': {
          e.preventDefault();
          if (isOpen && activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
            addTag(filteredSuggestions[activeIndex]);
          } else {
            addTag(inputValue);
          }
          return;
        }
        case 'Tab': {
          // Tab accepts the highlighted suggestion, otherwise moves focus as usual
          if (isOpen && activeIndex >= 0) {
            e.preventDefault();
            addTag(filteredSuggestions[activeIndex]);
          }
          return;
        }
        case 'Escape': {
          if (isOpen) {
            e.preventDefault();
            setShowSuggestions(false);
            setActiveIndex(-1);
          }
          return;
        }
        case 'Backspace': {
          // Remove last tag on Backspace if input is empty
          if (!inputValue && value.length > 0) {
            removeTag(value[value.length - 1]);
          }
          return;
        }
      }
    };

    const handleBlur = () => {
      // Add the typed text when leaving the field. Clicking a suggestion
      // doesn't blur the input (see handleSuggestionMouseDown).
      if (inputValue.trim()) {
        addTag(inputValue);
      }
      setShowSuggestions(false);
      setActiveIndex(-1);
    };

    const handleSuggestionMouseDown = (e: React.MouseEvent) => {
      e.preventDefault(); // Keep focus in the input so blur doesn't fire
    };

    const handleSuggestionClick = (suggestion: string) => {
      addTag(suggestion);
      inputRef.current?.focus();
    };

    return (
      <div className="mb-4">
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
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
                key={tagKey(tag)}
                className="flex items-center px-2 py-1 text-sm bg-gray-200 rounded-full dark:bg-gray-700"
              >
                <span className="mr-1">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  &times;
                </button>
              </div>
            ))}

            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
              autoComplete="off"
              maxLength={MAX_TAG_LENGTH}
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
          {isOpen && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg dark:bg-gray-800 dark:border-gray-700"
            >
              <ul id={listboxId} role="listbox" className="py-1 max-h-60 overflow-auto">
                {filteredSuggestions.map((suggestion, index) => (
                  <li
                    key={suggestion}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`px-3 py-2 text-sm cursor-pointer ${
                      index === activeIndex
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onMouseDown={handleSuggestionMouseDown}
                    onMouseEnter={() => setActiveIndex(index)}
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
