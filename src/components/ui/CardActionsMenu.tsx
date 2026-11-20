import { useEffect, useId, useRef, useState } from 'react';
import { DotsIcon, PencilIcon, TrashIcon } from '@/components/topics/icons';

interface CardActionsMenuProps {
  /** What the actions apply to, for the button label ("Actions for PRES on MRI"). */
  itemLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * "⋯" menu pinned to a card's top-right corner with Edit and Delete, so an
 * item can be changed without opening it. Sits above the card's stretched
 * link (z-10) and never lets its clicks reach it.
 */
export default function CardActionsMenu({ itemLabel, onEdit, onDelete }: CardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const choose = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    action();
  };

  const itemClass =
    'flex items-center w-full gap-2 px-3 py-2 text-sm text-left focus:outline-none hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700';

  return (
    <div ref={rootRef} className="absolute z-10 top-2 right-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Actions for ${itemLabel}`}
        title="Edit or delete"
        className="p-1.5 text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Actions for ${itemLabel}`}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-20 py-1 mt-1 bg-white border border-gray-300 rounded-md shadow-lg w-36 dark:bg-gray-800 dark:border-gray-700"
        >
          <button type="button" role="menuitem" onClick={choose(onEdit)} className={`${itemClass} text-gray-800 dark:text-gray-100`}>
            <PencilIcon />
            Edit
          </button>
          <button type="button" role="menuitem" onClick={choose(onDelete)} className={`${itemClass} text-red-700 dark:text-red-400`}>
            <TrashIcon />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
