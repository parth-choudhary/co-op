// Splits a fetched timeline into "older" (candidate for summarization) and
// "recent" (verbatim window).
//
// Cursor-aware: if the rolling summary already covers up to event/comment X,
// we don't summarize anything older than X again — we only consider turns
// strictly after X as candidates for the next compaction.

import type { RawTurn } from './types';
import { HISTORY_CONFIG } from './types';

export interface SplitResult {
  /** Turns to summarize on the next compaction (already-summarized turns are excluded). */
  toSummarize: RawTurn[];
  /** Verbatim recent window. */
  recent: RawTurn[];
  /** Should we extend the summary right now? */
  shouldExtendSummary: boolean;
}

export function splitTurnsForWindow(opts: {
  turns: RawTurn[];
  /** Cursor: id of the most recent turn already covered by the rolling summary. */
  summarizedUpToId?: string | null;
  recentWindow?: number;
  triggerCount?: number;
}): SplitResult {
  const recentWindow = opts.recentWindow ?? HISTORY_CONFIG.recentWindow;
  const triggerCount = opts.triggerCount ?? HISTORY_CONFIG.summaryTriggerCount;

  // Always keep the last `recentWindow` turns verbatim.
  const recent = opts.turns.slice(-recentWindow);
  const older = opts.turns.slice(0, Math.max(0, opts.turns.length - recentWindow));

  // Of the older block, only the turns after our existing summary cursor are
  // candidates for the next extension.
  let toSummarize = older;
  if (opts.summarizedUpToId) {
    const cursorIdx = older.findIndex((t) => t.id === opts.summarizedUpToId);
    if (cursorIdx >= 0) {
      toSummarize = older.slice(cursorIdx + 1);
    }
    // If the cursor isn't in our fetched window, the summary is already ahead of
    // (or covers more than) what we fetched. Skip extension.
    else {
      toSummarize = [];
    }
  }

  return {
    toSummarize,
    recent,
    shouldExtendSummary: toSummarize.length >= triggerCount,
  };
}
