import { useEffect } from 'react';

/**
 * Registers a window Escape key listener while a modal or overlay is open.
 * @param {boolean} isActive
 * @param {(event: KeyboardEvent) => void} onEscape
 */
export function useEscapeKey(isActive, onEscape) {
  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onEscape?.(event);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}

