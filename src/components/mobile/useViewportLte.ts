'use client';
import { useEffect, useState } from 'react';

// M1 Phase 1 / Plan 01-04.3 — viewport-aware breakpoint hook.
//
// Returns true when the viewport is at-or-below the given breakpoint.
// Initial render is `false` (desktop) on the server; hydration may flash
// to `true` on phones. Layout-flash is acceptable for v1; if it becomes
// annoying we can layer an inline matchMedia check in <head> later.

const BREAKPOINTS = { sm: 480, md: 768, lg: 1024 } as const;

export function useViewportLte(bp: keyof typeof BREAKPOINTS): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINTS[bp] - 1}px)`);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [bp]);
  return matches;
}
