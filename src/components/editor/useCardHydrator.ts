'use client';

// Tiny hook that returns a memoized hydrate function for the RichComposer.
// Calls POST /api/cards/resolve-keys for the given keys and returns
// { title, columnName } per resolved key.

import { useCallback } from 'react';

export function useCardHydrator(projectId: string) {
  return useCallback(async (keys: string[]) => {
    if (!projectId || keys.length === 0) return {};
    try {
      const res = await fetch('/api/cards/resolve-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, keys }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      const out: Record<string, { title: string; columnName: string }> = {};
      for (const [key, meta] of Object.entries((data?.cards || {}) as Record<string, any>)) {
        out[key] = { title: meta?.title || key, columnName: meta?.columnName || '' };
      }
      return out;
    } catch {
      return {};
    }
  }, [projectId]);
}
