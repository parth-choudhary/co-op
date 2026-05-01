// CardMention — atomic inline TipTap node that renders a card pill chip in
// the editor surface. Behaves as a single unit: cursor steps over it, backspace
// deletes the whole pill.
//
// Attributes:
//   key       (string)            — e.g. "COOP-123"
//   projectId (string)            — for building the canonical URL
//   title     (string | null)     — hydrated lazily; null while loading
//   columnName (string | null)    — same
//
// Serialization:
//   Sent:    pasted into HTML as `<a class="card-pill" data-card-key="...">`
//   Stored:  via the markdown serializer in serializeDocToMarkdown — emitted as
//            `[<KEY>](<url>)` so the display layer (already deployed in Phase A)
//            collapses it back to a pill without any coordination.

import { Node, mergeAttributes } from '@tiptap/core';
import { pathForCardKey } from '@/lib/appRoutes';

export interface CardMentionAttrs {
  cardKey: string;
  projectId: string;
  title?: string | null;
  columnName?: string | null;
}

export const CardMention = Node.create({
  name: 'cardMention',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      cardKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-card-key') || '',
        renderHTML: (attrs) => ({ 'data-card-key': attrs.cardKey }),
      },
      projectId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-project-id') || '',
        renderHTML: (attrs) => ({ 'data-project-id': attrs.projectId }),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-card-title'),
        renderHTML: (attrs) => (attrs.title ? { 'data-card-title': attrs.title } : {}),
      },
      columnName: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-card-status'),
        renderHTML: (attrs) => (attrs.columnName ? { 'data-card-status': attrs.columnName } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a.card-pill[data-card-key]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as CardMentionAttrs;
    const href = attrs.projectId ? pathForCardKey(attrs.projectId, attrs.cardKey) : '#';
    const merged = mergeAttributes(HTMLAttributes, {
      class: 'card-pill',
      'data-known': attrs.title ? 'true' : 'false',
      href,
      // contenteditable=false makes the node atomic — TipTap also handles this
      // because of `atom: true`, but the attribute is what tells the browser to
      // treat the inner DOM as a single unit so cursor / IME behave right.
      contenteditable: 'false',
      title: attrs.title ? `${attrs.cardKey} · ${attrs.columnName || ''}` : attrs.cardKey,
    });
    // Mirror the structure used by CardKeyPill / ChatMessageContent so the same
    // CSS rules apply inside and outside the editor.
    const children: any[] = [
      ['span', { class: 'card-pill-key' }, attrs.cardKey],
    ];
    if (attrs.title) {
      children.push(['span', { class: 'card-pill-title' }, attrs.title]);
    }
    if (attrs.columnName) {
      children.push(['span', { class: 'card-pill-status' }, attrs.columnName]);
    }
    return ['a', merged, ...children];
  },

  // Render as plain text when the doc is serialized to plain text (Cmd-A copy,
  // for instance). The markdown serializer below is what we actually use to
  // ship to the wire.
  renderText({ node }) {
    return (node.attrs as CardMentionAttrs).cardKey;
  },
});
