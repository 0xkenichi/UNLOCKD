"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'vestra:stealthMode';

interface StealthContextType {
  isStealthMode: boolean;
  setStealthMode: (enabled: boolean) => void;
  toggleStealthMode: () => void;
}

const StealthContext = createContext<StealthContextType | undefined>(undefined);

export const StealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isStealthMode, setIsStealthMode] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setIsStealthMode(true);
    }

    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setIsStealthMode(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setStealthMode = useCallback((enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    setIsStealthMode(enabled);
    
    // Dispatch custom event for cross-tab sync if needed
    window.dispatchEvent(new Event('stealthModeChange'));
  }, []);

  const toggleStealthMode = useCallback(() => {
    setStealthMode(!isStealthMode);
  }, [isStealthMode, setStealthMode]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isStealthMode) {
        document.body.classList.add('stealth-active');
      } else {
        document.body.classList.remove('stealth-active');
      }
    }
  }, [isStealthMode]);

  const value = useMemo(() => ({
    isStealthMode,
    setStealthMode,
    toggleStealthMode
  }), [isStealthMode, setStealthMode, toggleStealthMode]);

  return (
    <StealthContext.Provider value={value}>
      {isStealthMode && <div className="noise-overlay" />}
      {isStealthMode && <div className="fixed inset-0 pointer-events-none stealth-grid z-[9998] opacity-20" />}
      {children}
    </StealthContext.Provider>
  );
};

export const useStealthMode = () => {
  const context = useContext(StealthContext);
  if (context === undefined) {
    throw new Error('useStealthMode must be used within a StealthProvider');
  }
  return context;
};
