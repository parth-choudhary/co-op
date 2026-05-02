// Memory v4 / Phase 4 — pure aggregation helpers for the retrieval audit UI.
// Extracted from AgentHarnessModal so the logic is testable without React.

export interface ActivityEventLike {
  createdAt: string;
  payload: any;
}

export interface RetrievalAggregate {
  count: number;
  recent: Array<{ ts: string; score: number | null }>;
}

export const RETRIEVAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const RETRIEVAL_RECENT_PER_KEY = 3;

/**
 * Walk a list of memory_retrieved (or project_memory_retrieved) activity
 * events and produce a per-key aggregate: how many times each key was
 * pulled into the prompt within the window, plus the most-recent N
 * retrievals (ts + score).
 *
 * Events older than `windowMs` are skipped. Defaults: 30-day window,
 * 3 recent retrievals retained per key. The caller (MemoryPanel) uses
 * the count for the badge and `recent` for the hover-tooltip.
 *
 * Pure: no fetches, no side effects. Pass any array of events with the
 * { createdAt, payload: { retrieved: [{ key, score }] } } shape.
 */
export function aggregateRetrievalsByKey(
  events: ActivityEventLike[],
  windowMs: number = RETRIEVAL_WINDOW_MS,
  recentPerKey: number = RETRIEVAL_RECENT_PER_KEY,
  now: number = Date.now(),
): Record<string, RetrievalAggregate> {
  const cutoff = now - windowMs;
  const map: Record<string, RetrievalAggregate> = {};

  for (const e of events) {
    const ts = new Date(e.createdAt).getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;

    const retrieved: Array<{ key: string; score: number | null }> = e.payload?.retrieved || [];
    for (const r of retrieved) {
      if (!r || typeof r.key !== 'string') continue;
      const slot = (map[r.key] ||= { count: 0, recent: [] });
      slot.count += 1;
      if (slot.recent.length < recentPerKey) {
        slot.recent.push({ ts: e.createdAt, score: r.score ?? null });
      }
    }
  }

  return map;
}
