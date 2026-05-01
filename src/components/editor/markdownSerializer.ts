// Serialize a TipTap (ProseMirror) doc to the on-the-wire markdown the rest
// of the app already understands.
//
// Targeted at the message body shape only: paragraphs, soft breaks, marks
// (bold, italic, code, link), card mention pills, plain text. Anything richer
// degrades to plain text — composer doesn't expose those tools yet.
//
// Round-trip contract:
//   editor → serialize → wire
//   wire   → display (existing MessageBody / ChatMessageContent renders pills)
//
// CardMention nodes are emitted as `[<KEY>](<url>)` autolinks. This is what
// Phase A's display detection already collapses into a pill — no coordination
// needed across the boundary.

import type { JSONContent } from '@tiptap/core';
import { pathForCardKey } from '@/lib/appRoutes';

export function serializeDocToMarkdown(doc: JSONContent): string {
  if (!doc.content) return '';
  return doc.content.map(blockToMarkdown).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function blockToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return inlineRunToMarkdown(node.content || []);
    case 'heading': {
      const level = (node.attrs?.level as number) || 1;
      return '#'.repeat(level) + ' ' + inlineRunToMarkdown(node.content || []);
    }
    case 'bulletList':
      return (node.content || []).map((li) => '- ' + listItemInline(li)).join('\n');
    case 'orderedList':
      return (node.content || []).map((li, i) => `${i + 1}. ${listItemInline(li)}`).join('\n');
    case 'blockquote':
      return (node.content || [])
        .map(blockToMarkdown)
        .join('\n')
        .split('\n')
        .map((l) => '> ' + l)
        .join('\n');
    case 'codeBlock':
      return '```\n' + textRunOnly(node.content || []) + '\n```';
    case 'horizontalRule':
      return '---';
    default:
      // Unknown block: degrade to inline serialization.
      return inlineRunToMarkdown(node.content || []);
  }
}

function listItemInline(li: JSONContent): string {
  if (!li.content) return '';
  // A list item wraps a paragraph; collapse it.
  return li.content.map((b) => (b.type === 'paragraph' ? inlineRunToMarkdown(b.content || []) : blockToMarkdown(b))).join('\n');
}

function inlineRunToMarkdown(nodes: JSONContent[]): string {
  return nodes.map(inlineToMarkdown).join('');
}

function inlineToMarkdown(node: JSONContent): string {
  if (node.type === 'cardMention') {
    const key = (node.attrs?.cardKey as string) || '';
    const projectId = (node.attrs?.projectId as string) || '';
    if (!key) return '';
    const url = projectId ? pathForCardKey(projectId, key) : `/c/${key}`;
    return `[${key}](${url})`;
  }
  if (node.type === 'mention') {
    // TipTap's @-mention extension. Serialize as plain @name with underscores
    // instead of spaces — matches the existing comment/chat convention so the
    // backend mention-matcher keeps working.
    const label = (node.attrs?.label as string) || (node.attrs?.id as string) || '';
    return '@' + label.replace(/\s+/g, '_');
  }
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'text') {
    return applyMarks(node.text || '', node.marks || []);
  }
  // Unknown inline: try children.
  if (node.content) return inlineRunToMarkdown(node.content);
  return '';
}

function textRunOnly(nodes: JSONContent[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text || '' : '')).join('');
}

function applyMarks(text: string, marks: NonNullable<JSONContent['marks']>): string {
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': out = `**${out}**`; break;
      case 'italic': out = `*${out}*`; break;
      case 'code': out = `\`${out}\``; break;
      case 'strike': out = `~~${out}~~`; break;
      case 'link': {
        const href = (mark.attrs?.href as string) || '';
        if (href) out = `[${out}](${href})`;
        break;
      }
    }
  }
  return out;
}

/** Detect whether a serialized doc has any non-whitespace user content.
 *  Used to gate the send button. Card mentions count as content. */
export function docHasContent(doc: JSONContent): boolean {
  if (!doc.content) return false;
  let found = false;
  const walk = (n: JSONContent) => {
    if (found) return;
    if (n.type === 'cardMention' || n.type === 'mention') { found = true; return; }
    if (n.type === 'text' && (n.text || '').trim()) { found = true; return; }
    (n.content || []).forEach(walk);
  };
  doc.content.forEach(walk);
  return found;
}
