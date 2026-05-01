// Top-level orchestrators for the chat-history layer. Two stages:
//
//   1. fetchChatHistoryShared / fetchCardHistoryShared
//      — fetch raw turns from the source, split into older + recent, extend
//        the rolling summary if the threshold has been crossed. Expensive
//        (network + LLM call). Cache-friendly across multiple agents triggered
//        by the same message.
//
//   2. formatHistoryForAgent
//      — given the result of stage 1 + a specific agent identity, produce
//        PriorMessage[] ready to splice into runAgent. Cheap, per-agent.
//
// Why split: in a chat room with N mentioned agents, we'd otherwise do the
// fetch+summary work N times for the same room. Stage 1 is shared, stage 2
// runs per agent so each one sees its own messages as `assistant`.

import type { PriorMessage, FetchedHistory, RawTurn } from './types';
import { HISTORY_CONFIG } from './types';
import { fetchMatrixRoomTurns } from './sources/matrix';
import { fetchCardCommentTurns } from './sources/comments';
import { splitTurnsForWindow } from './window';
import { resolveSenders, nameFor, type ResolvedSenders } from './senderResolver';
import { readChatSummary, readCardSummary } from './summary/store';
import { extendChatSummary, extendCardSummary } from './summary/extend';
import { formatTurnsForAgent, type SelfIdentity } from './format';

// ============================================================================
// Stage 1 — shared fetch+summarize
// ============================================================================

interface SharedFetchResult {
  history: FetchedHistory;
  /** Sender resolution for everyone in `recent`. Reused by stage 2. */
  resolved: ResolvedSenders;
}

export async function fetchChatHistoryShared(opts: {
  channelId: string;
  matrixRoomId: string;
  /** Access token for fetching from Matrix. Use the triggering agent's token. */
  matrixAccessToken: string;
  /** Project — needed for picking the cheap-model API key during summary extension. */
  projectId: string | null;
  /** Provider used for the cheap summarizer (matches the triggering agent's provider). */
  provider: 'anthropic' | 'openai';
}): Promise<SharedFetchResult> {
  const turns = await fetchMatrixRoomTurns({
    matrixRoomId: opts.matrixRoomId,
    accessToken: opts.matrixAccessToken,
    limit: HISTORY_CONFIG.matrixFetchLimit,
  });

  const prior = await readChatSummary(opts.channelId);
  const split = splitTurnsForWindow({
    turns,
    summarizedUpToId: prior?.upToId ?? null,
  });

  // Resolve display names once for everyone who appears in either the recent
  // window or the to-summarize block.
  const resolved = await resolveSenders([
    ...split.recent.map((t) => t.sender),
    ...split.toSummarize.map((t) => t.sender),
  ]);

  let summary = prior?.summary ?? null;
  if (split.shouldExtendSummary) {
    summary = await extendChatSummary({
      channelId: opts.channelId,
      provider: opts.provider,
      projectId: opts.projectId,
      newTurns: split.toSummarize,
      resolved,
    });
  }

  return {
    history: {
      summary,
      recent: split.recent,
      source: { kind: 'chat', channelId: opts.channelId },
    },
    resolved,
  };
}

export async function fetchCardHistoryShared(opts: {
  cardId: string;
  projectId: string | null;
  provider: 'anthropic' | 'openai';
}): Promise<SharedFetchResult> {
  const turns = await fetchCardCommentTurns({
    cardId: opts.cardId,
    limit: HISTORY_CONFIG.commentFetchLimit,
  });

  const prior = await readCardSummary(opts.cardId);
  const split = splitTurnsForWindow({
    turns,
    summarizedUpToId: prior?.upToId ?? null,
  });

  const resolved = await resolveSenders([
    ...split.recent.map((t) => t.sender),
    ...split.toSummarize.map((t) => t.sender),
  ]);

  let summary = prior?.summary ?? null;
  if (split.shouldExtendSummary) {
    summary = await extendCardSummary({
      cardId: opts.cardId,
      provider: opts.provider,
      projectId: opts.projectId,
      newTurns: split.toSummarize,
      resolved,
    });
  }

  return {
    history: {
      summary,
      recent: split.recent,
      source: { kind: 'card', cardId: opts.cardId },
    },
    resolved,
  };
}

// ============================================================================
// Stage 2 — per-agent formatting
// ============================================================================

/**
 * Convert a shared-fetch result into PriorMessage[] for one specific agent.
 * The agent's own past turns become role='assistant'; everything else becomes
 * role='user' with a sender prefix.
 *
 * The summary (if any) is prepended as a single `user` turn framed as a
 * briefing — not in the system prompt (that stays cacheable), not as
 * `assistant` (it isn't the agent's own voice).
 *
 * The current message that triggered this run is NOT part of priorMessages —
 * runAgent appends it via the existing userPrompt path. We exclude it here
 * (it'll be the most-recent turn in `recent`) by id if the caller passes one.
 */
export function formatHistoryForAgent(opts: {
  fetched: SharedFetchResult;
  self: SelfIdentity;
  /** Optional: id of the just-arrived message to drop from the recent window so it isn't double-fed. */
  excludeTurnId?: string | null;
}): PriorMessage[] {
  const { history, resolved } = opts.fetched;

  let recent = history.recent;
  if (opts.excludeTurnId) {
    recent = recent.filter((t) => t.id !== opts.excludeTurnId);
  }

  const messages = formatTurnsForAgent(recent, opts.self, resolved);

  if (history.summary && history.summary.trim()) {
    const summaryBlock: PriorMessage = {
      role: 'user',
      content: `[Earlier in this ${history.source.kind === 'chat' ? 'room' : 'card thread'} — summary]\n\n${history.summary.trim()}`,
    };
    return [summaryBlock, ...messages];
  }

  return messages;
}

// Re-export for callers that need the raw type
export type { SharedFetchResult };
// Mark `nameFor` and `RawTurn` as used to keep the import surface stable for tuning experiments.
export { nameFor };
export type { RawTurn };
