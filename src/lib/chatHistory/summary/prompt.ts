// Structured summarization prompt. Designed to extract dense, agent-useful
// signal from chat — not narrative recap. The summary will be shown as a
// single user-turn block at the start of the conversation, so it must read
// as a *briefing* an agent can act on, not a story.

import type { RawTurn } from '../types';
import type { ResolvedSenders } from '../senderResolver';
import { nameFor } from '../senderResolver';

export const SUMMARIZER_SYSTEM_PROMPT = `You compress chat history for an AI teammate that needs to pick up a conversation. Your output is read by other AIs and humans, not stored as a transcript.

Always produce these sections, even if some are empty (use "(none)"):

## Topic timeline
A 1-3 line bulleted list, oldest to newest, naming the main topics in order.

## Decisions
Concrete decisions made, who made them, what was decided. Bulleted.

## Action items
"<person> → <thing they committed to do>". One line each.

## Open questions
Unresolved questions or asks waiting on someone. Include who is waiting on whom.

## Identifiers mentioned
Card ids ([abc123]), URLs, file paths, project names, person names that came up. Bulleted.

## Tone / dynamics
1-2 lines on the room's working state (collaborative? blocked? frustrated? slow?). Skip if unremarkable.

Rules:
- Be terse. No filler, no narrative recap, no "the team discussed...".
- Preserve concrete strings verbatim (ids, names, URLs). Never paraphrase an identifier.
- If you are extending a previous summary, MERGE — keep prior decisions/items still relevant; drop ones that have been resolved or superseded by the new messages; don't repeat closed items.
- Output plain Markdown. No preamble, no closing remarks.`;

/**
 * Build the user-message body for the summarizer:
 *   (optional) prior summary
 *   (turns block, sender-prefixed, chronological)
 */
export function buildSummarizerUserMessage(opts: {
  priorSummary?: string | null;
  turns: RawTurn[];
  resolved: ResolvedSenders;
}): string {
  const parts: string[] = [];

  if (opts.priorSummary && opts.priorSummary.trim()) {
    parts.push('# Prior summary (extend this — merge new info, drop resolved items)');
    parts.push(opts.priorSummary.trim());
    parts.push('\n---\n');
    parts.push('# New messages to fold in');
  } else {
    parts.push('# Messages to summarize');
  }

  const lines: string[] = [];
  for (const t of opts.turns) {
    const name = nameFor(t.sender, opts.resolved);
    const ts = t.timestamp.toISOString().replace('T', ' ').slice(0, 16);
    // Compact one-liner per turn. Multi-line bodies are inlined with " ⏎ " so
    // the summarizer sees structure but doesn't burn tokens on trailing whitespace.
    const body = t.content.replace(/\s+/g, ' ').trim();
    lines.push(`- [${ts}] ${name}: ${body}`);
  }
  parts.push(lines.join('\n'));

  return parts.join('\n');
}
