import { useEffect, useState } from 'react';

export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return initialValue;
      const parsed: unknown = JSON.parse(stored);
      if (parsed === null || typeof parsed !== typeof initialValue || Array.isArray(parsed) !== Array.isArray(initialValue)) return initialValue;
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The interface remains usable when browser storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue] as const;
}