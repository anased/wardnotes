import { useEffect, useId, useRef, useState } from 'react';
import { DotsIcon } from './icons';

interface MoveToSectionMenuProps {
  /** What is being moved, for the button label ("Move PRES on MRI to section"). */
  itemLabel: string;
  sections: { id: string; name: string }[];
  currentSectionId: string | null;
  onMove: (sectionId: string | null) => void;
  disabled?: boolean;
}

/** Small "⋯" menu that files an item under one of the topic's sections or Unsorted. */
export default function MoveToSectionMenu({
  itemLabel,
  sections,
  currentSectionId,
  onMove,
  disabled,
}: MoveToSectionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = [...sections.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: 'Unsorted' }];

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Move ${itemLabel} to a section`}
        title="Move to section"
        className="p-1.5 text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Move to section"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-20 py-1 mt-1 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg w-52 max-h-72 dark:bg-gray-800 dark:border-gray-700"
        >
          <p className="px-3 pt-1 pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Move to section</p>
          {options.map((o) => {
            const current = o.id === currentSectionId;
            return (
              <button
                key={o.id ?? 'unsorted'}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => {
                  setOpen(false);
                  if (!current) onMove(o.id);
                }}
                className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
              >
                <span aria-hidden="true" className="w-4 text-primary-600 dark:text-primary-400">
                  {current ? '✓' : ''}
                </span>
                <span className={`truncate ${o.id === null ? 'italic' : ''}`}>{o.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
