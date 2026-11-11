import { useEffect, useId, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { tagKey, tagsEqual } from '@/lib/utils/tagUtils';

export interface TagFilterOption {
  name: string;
  /** Notes using this tag; null when counts are unavailable. */
  count: number | null;
}

interface TagFilterComboboxProps {
  options: TagFilterOption[];
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Searchable multi-select for filtering by tags.
 *
 * Follows the ARIA combobox pattern: the text input owns a listbox of tags
 * (aria-multiselectable). Type to filter, ArrowUp/ArrowDown to move, Enter
 * or click to toggle a tag, Escape to close, Backspace on an empty input to
 * remove the last selected tag. Selected tags are shown as removable chips.
 */
export default function TagFilterCombobox({
  options,
  value,
  onChange,
  label = 'Tags',
  placeholder = 'Filter by tags…',
}: TagFilterComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const isSelected = (name: string) => value.some((v) => tagsEqual(v, name));

  // Options matching the query; names starting with it come first.
  const filtered = useMemo(() => {
    const q = tagKey(query);
    if (!q) return options;
    const matches = options.filter((o) => tagKey(o.name).includes(q));
    return [
      ...matches.filter((o) => tagKey(o.name).startsWith(q)),
      ...matches.filter((o) => !tagKey(o.name).startsWith(q)),
    ];
  }, [options, query]);

  const activeIndex = Math.min(highlightedIndex, filtered.length - 1);
  const isOpen = open && filtered.length > 0;

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // optionId only depends on a stable id
  }, [activeIndex, isOpen]);

  // Close when clicking outside
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const toggle = (name: string) => {
    onChange(isSelected(name) ? value.filter((v) => !tagsEqual(v, name)) : [...value, name]);
    setQuery('');
    setHighlightedIndex(0);
  };

  const remove = (name: string) => {
    onChange(value.filter((v) => !tagsEqual(v, name)));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(0);
        } else if (filtered.length > 0) {
          setHighlightedIndex((activeIndex + 1) % filtered.length);
        }
        return;
      case 'ArrowUp':
        if (!isOpen) return;
        e.preventDefault();
        setHighlightedIndex(activeIndex <= 0 ? filtered.length - 1 : activeIndex - 1);
        return;
      case 'Enter':
        if (isOpen && activeIndex >= 0) {
          e.preventDefault();
          toggle(filtered[activeIndex].name);
        }
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case 'Backspace':
        if (!query && value.length > 0) {
          onChange(value.slice(0, -1));
        }
        return;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1.5 min-h-[42px] bg-white border border-gray-300 rounded-lg cursor-text focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 dark:bg-gray-800 dark:border-gray-700"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tagKey(tag)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-sm text-gray-800 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-100"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(tag);
              }}
              aria-label={`Remove tag filter ${tag}`}
              className="text-gray-500 rounded-full hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:text-gray-100"
            >
              &times;
            </button>
          </span>
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
          value={query}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-[6rem] py-0.5 text-sm bg-transparent outline-none dark:text-white"
        />
      </div>

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute z-20 w-full py-1 mt-1 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg max-h-72 dark:bg-gray-800 dark:border-gray-700"
        >
          {filtered.map((option, index) => {
            const selected = isSelected(option.name);
            return (
              <li
                key={option.name}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => toggle(option.name)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer dark:text-gray-100 ${
                  index === activeIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex items-center justify-center w-4 h-4 border rounded ${
                    selected
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-gray-400 dark:border-gray-500'
                  }`}
                >
                  {selected && '✓'}
                </span>
                <span className="flex-1 truncate">{option.name}</span>
                {option.count !== null && (
                  <span className="text-xs text-gray-600 tabular-nums dark:text-gray-400">
                    {option.count}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
