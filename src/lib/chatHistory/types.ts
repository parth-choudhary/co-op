// Shared types for the chat-history layer.
// The history layer fetches prior conversation turns from a source (Matrix room
// or card comment thread), runs them through identity / window / summarization
// transforms, and returns `PriorMessage[]` ready to splice into runAgent.

/** Format-neutral conversation turn. Provider adapters (Anthropic / OpenAI) consume these. */
export interface PriorMessage {
  role: 'user' | 'assistant';
  /** Plain-text content. For non-self user turns, content is sender-prefixed (e.g. "[Parth]: hi"). */
  content: string;
}

/** Raw turn before role-mapping. Source-agnostic shape. */
export interface RawTurn {
  /** Stable identifier in the source (Matrix event id, comment id). Used as summarization cursor. */
  id: string;
  /** When the turn happened. */
  timestamp: Date;
  /** Sender identity. The format step decides whether this is "self" (assistant) or "other" (user). */
  sender: SenderRef;
  /** Plain-text body. */
  content: string;
}

/** Lightweight reference to a sender. Resolved to a display name + matrix id by senderResolver. */
export interface SenderRef {
  /** Matrix user id like "@alice:coop.local" — present for Matrix-sourced turns. */
  matrixUserId?: string | null;
  /** App user id (humans) — present for comment-sourced turns. */
  userId?: string | null;
  /** App agent id — present for comment-sourced turns. */
  agentId?: string | null;
  /** Display name. Resolved lazily; may be null until senderResolver runs. */
  displayName?: string | null;
}

/** Output of fetch+summarize. Per-agent formatting consumes this. */
export interface FetchedHistory {
  /** Optional rolling summary of everything older than `recent`. */
  summary: string | null;
  /** The recent window — verbatim turns. */
  recent: RawTurn[];
  /** Source descriptor for diagnostics / logging. */
  source: { kind: 'chat'; channelId: string } | { kind: 'card'; cardId: string };
}

/** Tunable knobs. Centralized so we can change them without hunting. */
export const HISTORY_CONFIG = {
  /** How many recent turns to include verbatim. */
  recentWindow: 20,
  /** When the count of un-summarized aged-out turns hits this, extend the rolling summary. */
  summaryTriggerCount: 40,
  /** Soft cap on summary output tokens. The summarizer uses this as max_tokens. */
  summaryMaxTokens: 600,
  /** How many Matrix events to request per fetch. Slightly above the trigger so we can detect when summary needs extending. */
  matrixFetchLimit: 80,
  /** How many comments to load for card threads. */
  commentFetchLimit: 80,
} as const;
