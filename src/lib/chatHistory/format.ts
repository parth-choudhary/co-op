// Per-agent formatter: turns RawTurn[] + a "self" identity into PriorMessage[].
//
// Rules:
//   - Turns by `self` → role 'assistant', plain content (no prefix).
//   - All other turns → role 'user', content prefixed with "[<sender name>]: …"
//     so the model can disambiguate humans from other agents in busy rooms.
//   - Tool calls / tool results from past runs are NOT preserved. We only see
//     the surface text the agent posted (Matrix message body or Comment.content).
//     If the agent needs the data again it should re-call the tool.

import type { PriorMessage, RawTurn } from './types';
import { nameFor, type ResolvedSenders } from './senderResolver';

export interface SelfIdentity {
  /** Matrix user id of the agent we're formatting for, e.g. "@agent-cmo:coop.local". */
  matrixUserId?: string | null;
  /** App-side agent id of the agent we're formatting for. */
  agentId: string;
}

export function formatTurnsForAgent(
  turns: RawTurn[],
  self: SelfIdentity,
  resolved: ResolvedSenders,
): PriorMessage[] {
  const messages: PriorMessage[] = [];
  for (const t of turns) {
    const isSelf = isTurnFromSelf(t, self);
    if (isSelf) {
      messages.push({ role: 'assistant', content: t.content });
    } else {
      const name = nameFor(t.sender, resolved);
      messages.push({ role: 'user', content: `[${name}]: ${t.content}` });
    }
  }
  return collapseConsecutiveSameRole(messages);
}

function isTurnFromSelf(turn: RawTurn, self: SelfIdentity): boolean {
  if (self.matrixUserId && turn.sender.matrixUserId === self.matrixUserId) return true;
  if (turn.sender.agentId && turn.sender.agentId === self.agentId) return true;
  return false;
}

/**
 * Anthropic and OpenAI both reject (or warn on) consecutive messages with the
 * same role. Real chat rooms produce that constantly (multiple humans in a row,
 * or an agent posting two follow-up messages). Merge them by joining with a
 * blank line. Sender prefixes inside each line keep the speakers identifiable.
 */
function collapseConsecutiveSameRole(messages: PriorMessage[]): PriorMessage[] {
  const out: PriorMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
