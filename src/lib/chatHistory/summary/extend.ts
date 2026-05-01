// Rolling-summary extension. Given a block of new turns and the prior summary,
// produces an updated summary and persists it. Returns the new summary text so
// the caller can splice it into the current run's prior-messages without a
// second DB read.
//
// "Extension" = compaction: prior summary + new turns → new summary, capped in
// length. The summary stays bounded regardless of how long the room has lived.

import { runCheapSummary } from './model';
import { SUMMARIZER_SYSTEM_PROMPT, buildSummarizerUserMessage } from './prompt';
import { readChatSummary, writeChatSummary, readCardSummary, writeCardSummary, type StoredSummary } from './store';
import type { RawTurn } from '../types';
import { HISTORY_CONFIG } from '../types';
import type { ResolvedSenders } from '../senderResolver';

export interface ExtendArgs {
  /** Provider+key to use for summarization (matches the agent triggering this run). */
  provider: 'anthropic' | 'openai';
  projectId: string | null;
  /** Newly aged-out turns to fold into the summary. */
  newTurns: RawTurn[];
  /** Sender-resolution map covering everyone who appears in newTurns. */
  resolved: ResolvedSenders;
}

export async function extendChatSummary(args: ExtendArgs & { channelId: string }): Promise<string | null> {
  const prior = await readChatSummary(args.channelId);
  const result = await runExtension({ ...args, prior });
  if (!result) return prior?.summary ?? null;

  const last = args.newTurns[args.newTurns.length - 1];
  await writeChatSummary({
    channelId: args.channelId,
    summary: result.text,
    upToId: last?.id ?? prior?.upToId ?? null,
    upToTimestamp: last?.timestamp ?? prior?.upToTimestamp ?? null,
    messageCount: (prior?.messageCount ?? 0) + args.newTurns.length,
    modelUsed: result.modelUsed,
  });
  return result.text;
}

export async function extendCardSummary(args: ExtendArgs & { cardId: string }): Promise<string | null> {
  const prior = await readCardSummary(args.cardId);
  const result = await runExtension({ ...args, prior });
  if (!result) return prior?.summary ?? null;

  const last = args.newTurns[args.newTurns.length - 1];
  await writeCardSummary({
    cardId: args.cardId,
    summary: result.text,
    upToId: last?.id ?? prior?.upToId ?? null,
    upToTimestamp: last?.timestamp ?? prior?.upToTimestamp ?? null,
    messageCount: (prior?.messageCount ?? 0) + args.newTurns.length,
    modelUsed: result.modelUsed,
  });
  return result.text;
}

async function runExtension(args: ExtendArgs & { prior: StoredSummary | null }): Promise<{ text: string; modelUsed: string } | null> {
  if (args.newTurns.length === 0) return null;
  const userMessage = buildSummarizerUserMessage({
    priorSummary: args.prior?.summary ?? null,
    turns: args.newTurns,
    resolved: args.resolved,
  });

  try {
    const result = await runCheapSummary({
      provider: args.provider,
      projectId: args.projectId,
      system: SUMMARIZER_SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: HISTORY_CONFIG.summaryMaxTokens,
    });
    if (!result || !result.text) return null;
    return result;
  } catch (err: any) {
    console.warn('[summary/extend] summarization call failed:', err?.message || err);
    return null;
  }
}
