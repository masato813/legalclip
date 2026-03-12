/**
 * useLocalStorage - localStorageを使った永続化フック
 */

import { useState, useCallback } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error("localStorage write error:", error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue] as const;
}

// Favorites: law_id -> { lawTitle, lawNum, addedAt }
export interface FavoriteLaw {
  lawId: string;
  lawTitle: string;
  lawNum: string;
  addedAt: number;
}

// History: recent law accesses
export interface HistoryEntry {
  lawId: string;
  lawTitle: string;
  lawNum: string;
  accessedAt: number;
}

const MAX_HISTORY = 20;

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<FavoriteLaw[]>("legalclip-favorites", []);

  const addFavorite = useCallback(
    (lawId: string, lawTitle: string, lawNum: string) => {
      setFavorites((prev) => {
        if (prev.some((f) => f.lawId === lawId)) return prev;
        return [...prev, { lawId, lawTitle, lawNum, addedAt: Date.now() }];
      });
    },
    [setFavorites]
  );

  const removeFavorite = useCallback(
    (lawId: string) => {
      setFavorites((prev) => prev.filter((f) => f.lawId !== lawId));
    },
    [setFavorites]
  );

  const isFavorite = useCallback(
    (lawId: string) => favorites.some((f) => f.lawId === lawId),
    [favorites]
  );

  return { favorites, addFavorite, removeFavorite, isFavorite };
}

export function useHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("legalclip-history", []);

  const addToHistory = useCallback(
    (lawId: string, lawTitle: string, lawNum: string) => {
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.lawId !== lawId);
        const newEntry: HistoryEntry = { lawId, lawTitle, lawNum, accessedAt: Date.now() };
        return [newEntry, ...filtered].slice(0, MAX_HISTORY);
      });
    },
    [setHistory]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return { history, addToHistory, clearHistory };
}
