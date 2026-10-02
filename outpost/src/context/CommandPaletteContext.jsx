import React, { createContext, useContext, useState, useCallback } from 'react';

const CommandPaletteContext = createContext(null);

/**
 * CommandPaletteProvider
 * Top-level provider enabling global Cmd+K / Ctrl+K command palette
 * and rapid fuzzy-finder across routes, quick tools, and inventory SKUs.
 */
export function CommandPaletteProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <CommandPaletteContext.Provider
      value={{
        isOpen,
        setIsOpen,
        openPalette,
        closePalette,
        togglePalette
      }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

/**
 * Hook to access CommandPalette state.
 */
const defaultCtx = {
  isOpen: false,
  setIsOpen: () => {},
  openPalette: () => {},
  closePalette: () => {},
  togglePalette: () => {}
};

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  return ctx || defaultCtx;
}
