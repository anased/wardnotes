import { useState, useEffect } from 'react';

interface SelectionFloatingButtonProps {
  coordinates: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
  onClick: () => void;
  onDismiss: () => void;
}

export default function SelectionFloatingButton({
  coordinates,
  onClick,
  onDismiss,
}: SelectionFloatingButtonProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if mobile viewport
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      // On mobile, position fixed at bottom
      setPosition({ top: 0, left: 0 }); // Will use custom styles for mobile
    } else {
      // On desktop, position below selection, centered horizontally
      const buttonWidth = 200; // Approximate button width
      const gap = 8; // Gap below selection

      // TipTap's coordsAtPos returns viewport-relative coordinates
      // Since we're using position: fixed, we use them directly (no window.scrollY)
      const top = coordinates.bottom + gap;
      const centerX = (coordinates.left + coordinates.right) / 2;

      // Ensure button doesn't overflow viewport
      const viewportWidth = window.innerWidth;
      const adjustedLeft = Math.min(
        Math.max(centerX - buttonWidth / 2, 16), // 16px margin from left
        viewportWidth - buttonWidth - 16 // 16px margin from right
      );

      setPosition({ top, left: adjustedLeft });
    }
  }, [coordinates, isMobile]);

  // Handle scroll to dismiss
  useEffect(() => {
    const handleScroll = () => {
      onDismiss();
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, [onDismiss]);

  return (
    <div
      className={`fixed z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
        isMobile
          ? 'bottom-5 left-1/2 -translate-x-1/2'
          : ''
      }`}
      style={
        !isMobile
          ? {
              top: `${position.top}px`,
              left: `${position.left}px`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <button
          onClick={onClick}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          type="button"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Flashcard
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          type="button"
          aria-label="Dismiss"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
