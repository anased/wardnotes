import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tailwind max-width class for the panel. */
  maxWidth?: string;
}

/**
 * Dialog shell with the same look as the existing modals (category, deck,
 * delete confirm): dimmed backdrop, white/gray-800 card, title and ×.
 * Adds Escape to close, focus on open and dialog semantics.
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-modal-close])'
    );
    (first ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  // Portal to <body> so a sticky/transformed ancestor can't trap the dialog
  // under other content.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto p-6 bg-white rounded-lg shadow-lg dark:bg-gray-800 focus:outline-none`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="text-lg font-medium">
            {title}
          </h3>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
