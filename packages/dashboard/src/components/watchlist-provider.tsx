'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

const MAX_WATCHLIST = 20;
const STORAGE_KEY = 'beacon-watchlist';

interface WatchlistContextValue {
  watchlist: string[];
  toggle: (code: string) => void;
  isWatched: (code: string) => boolean;
  clear: () => void;
}

const WatchlistContext = createContext<WatchlistContextValue | undefined>(undefined);

function persist(codes: string[], setter: (codes: string[]) => void) {
  setter(codes);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // On mount: read from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed.filter((v): v is string => typeof v === 'string'));
        }
      }
    } catch {
      // Corrupt localStorage — start fresh
    }
  }, []);

  function toggle(code: string) {
    if (watchlist.includes(code)) {
      persist(watchlist.filter((c) => c !== code), setWatchlist);
    } else {
      if (watchlist.length >= MAX_WATCHLIST) {
        alert(`Watchlist is full (max ${MAX_WATCHLIST} companies). Remove one before adding another.`);
        return;
      }
      persist([...watchlist, code], setWatchlist);
    }
  }

  function isWatched(code: string): boolean {
    return watchlist.includes(code);
  }

  function clear() {
    persist([], setWatchlist);
  }

  return (
    <WatchlistContext.Provider value={{ watchlist, toggle, isWatched, clear }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return ctx;
}
