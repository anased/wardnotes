import { KeyboardEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import useTopics from '@/lib/hooks/useTopics';
import { ancestorPaths, findTopicByName, matchTopics, normalizeTopicName } from '@/lib/utils/topicTree';

interface TopicSelectProps {
  label?: string;
  /** Selected topic ids, in order. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Topics that can't be chosen (e.g. the topic itself and its subtopics). */
  excludeIds?: Set<string>;
  placeholder?: string;
  /**
   * When set, typing a name with no exact name/alias match offers
   * "Create topic “…”"; resolve to the new topic's id to select it.
   */
  onCreate?: (name: string) => Promise<string | null>;
  /** Renders each selected chip; defaults to the topic name with a remove button. */
  renderChip?: (id: string, remove: () => void) => ReactNode;
  /** Don't show selected topics as chips (the caller lists them itself). */
  hideChips?: boolean;
  /** Accessible description id (e.g. a hint below the field). */
  describedBy?: string;
  error?: string;
}

type Option =
  | { kind: 'topic'; id: string; name: string; matchedAlias: string | null; path: string }
  | { kind: 'create'; name: string };

/**
 * Searchable multi-select for topics. Typed text is matched against topic
 * names and aliases (ignoring case) before anything new can be created, so
 * "RPLS" finds PRES. Follows the same combobox pattern and look as TagInput.
 */
export default function TopicSelect({
  label,
  value,
  onChange,
  excludeIds,
  placeholder = 'Search topics…',
  onCreate,
  renderChip,
  hideChips = false,
  describedBy,
  error,
}: TopicSelectProps) {
  const { topics, graph } = useTopics();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  /** "Neurology › Cerebrovascular" for the first path above a topic. */
  const parentPath = (id: string) => {
    const [path] = ancestorPaths(graph, id, 1);
    return (path ?? [])
      .slice(0, -1)
      .map((p) => graph.byId.get(p)?.name)
      .join(' › ');
  };

  const options: Option[] = useMemo(() => {
    const available = topics.filter((t) => !value.includes(t.id) && !excludeIds?.has(t.id));
    const q = normalizeTopicName(query);
    const list: Option[] = q
      ? matchTopics(available, q, 12).map((m) => ({
          kind: 'topic' as const,
          id: m.topic.id,
          name: m.topic.name,
          matchedAlias: m.matchedAlias,
          path: parentPath(m.topic.id),
        }))
      : available.slice(0, 50).map((t) => ({
          kind: 'topic' as const,
          id: t.id,
          name: t.name,
          matchedAlias: null,
          path: parentPath(t.id),
        }));
    // Offer to create only when nothing (selected or not) already has this name or alias
    if (onCreate && q && !findTopicByName(topics, q)) list.push({ kind: 'create', name: q });
    return list;
  }, [topics, graph, value, excludeIds, query, onCreate]);

  const activeIndex = Math.min(highlightedIndex, options.length - 1);
  const isOpen = open && options.length > 0;

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const choose = async (option: Option) => {
    if (option.kind === 'topic') {
      onChange([...value, option.id]);
    } else if (onCreate && !creating) {
      setCreating(true);
      try {
        const id = await onCreate(option.name);
        if (id && !value.includes(id)) onChange([...value, id]);
      } finally {
        setCreating(false);
      }
    }
    setQuery('');
    setHighlightedIndex(0);
    // Close so the list doesn't cover what was just picked; typing reopens it
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    onChange(value.filter((v) => v !== id));
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
        } else if (options.length > 0) {
          setHighlightedIndex((activeIndex + 1) % options.length);
        }
        return;
      case 'ArrowUp':
        if (!isOpen) return;
        e.preventDefault();
        setHighlightedIndex(activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
        return;
      case 'Enter':
        if (isOpen && activeIndex >= 0) {
          e.preventDefault();
          choose(options[activeIndex]);
        } else if (query) {
          e.preventDefault();
        }
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        return;
      case 'Backspace':
        if (!query && value.length > 0 && !hideChips) onChange(value.slice(0, -1));
        return;
    }
  };

  return (
    <div ref={rootRef} className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          className={`flex flex-wrap items-center gap-2 p-2 border rounded-lg border-gray-300 cursor-text focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 dark:border-gray-700 dark:focus-within:border-primary-500 ${
            error ? 'border-red-500' : ''
          }`}
          onClick={() => inputRef.current?.focus()}
        >
          {!hideChips && value.map((id) =>
            renderChip ? (
              <span key={id} className="contents">
                {renderChip(id, () => remove(id))}
              </span>
            ) : (
              <span key={id} className="flex items-center px-2 py-1 text-sm bg-gray-200 rounded-full dark:bg-gray-700">
                <span className="mr-1">{graph.byId.get(id)?.name ?? 'Unknown topic'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(id);
                  }}
                  aria-label={`Remove topic ${graph.byId.get(id)?.name ?? ''}`}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  &times;
                </button>
              </span>
            )
          )}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            maxLength={120}
            value={query}
            placeholder={value.length === 0 || hideChips ? placeholder : ''}
            disabled={creating}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-[120px] outline-none bg-transparent"
          />
        </div>

        {isOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label || 'Topics'}
            className="absolute z-20 w-full py-1 mt-1 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg max-h-60 dark:bg-gray-800 dark:border-gray-700"
          >
            {options.map((option, index) => (
              <li
                key={option.kind === 'topic' ? option.id : `create:${option.name}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => choose(option)}
                className={`px-3 py-2 text-sm cursor-pointer dark:text-gray-100 ${
                  index === activeIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                {option.kind === 'topic' ? (
                  <>
                    <span className="block truncate">
                      {option.name}
                      {option.matchedAlias && (
                        <span className="ml-1 text-gray-500 dark:text-gray-400">({option.matchedAlias})</span>
                      )}
                    </span>
                    {option.path && (
                      <span className="block text-xs text-gray-500 truncate dark:text-gray-400">{option.path}</span>
                    )}
                  </>
                ) : (
                  <span className="text-primary-600 dark:text-primary-400">
                    Create topic &ldquo;{option.name}&rdquo;
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
