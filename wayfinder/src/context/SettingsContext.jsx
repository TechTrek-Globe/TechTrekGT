import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

const STORAGE_KEY = 'wayfinder_user_settings';

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const defaults = {
      currency: 'USD',
      temperature: 'F',
      distance: 'mi',
      weight: 'lbs'
    };
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return { ...defaults, ...JSON.parse(cached) };
      }
    } catch {
      // Ignore parse errors
    }
    return defaults;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = () => setIsSettingsOpen(true);
  const closeSettings = () => setIsSettingsOpen(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore quota errors
    }
  }, [settings]);

  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ 
      settings, 
      updateSettings,
      isSettingsOpen,
      setIsSettingsOpen,
      openSettings,
      closeSettings
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
