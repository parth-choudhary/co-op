// Input + paste rules that turn card refs into CardMention nodes.
//
//   Paste handler   — runs on the entire pasted text. Any card URL or bare key
//                     in it gets replaced with a CardMention node atomically
//                     (so a single paste of "look at https://.../c/COOP-1 and
//                     COOP-2" produces two pills + the surrounding text).
//
//   InputRule (key) — fires when the user types text that ends with a card-key
//                     pattern followed by a space. Replaces the typed text
//                     with a pill, preserves the trailing space. Trello/Linear
//                     UX.
//
//   InputRule (url) — same idea for URLs ending in space — covers the case
//                     where the user pastes a URL into a plaintext spot and
//                     hits space.
//
// Both rules also fire title hydration: the calling code passes a hydrator
// callback that takes a key and resolves to { title, columnName }, used to fill
// in the pill's display content async.

import { Extension, InputRule, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { CardMention } from './CardMention';
import { extractCardRefs, type CardRef } from '@/lib/cardLinks';

export type HydrateFn = (keys: string[]) => Promise<Record<string, { title: string; columnName: string }>>;

interface CardRulesOptions {
  /** Project the composer is scoped to. Used as the default for bare-key matches. */
  projectId: string;
  /** Async title/status fetcher. Called whenever a new key is inserted. */
  hydrate: HydrateFn;
}

export const CardMentionRules = Extension.create<CardRulesOptions>({
  name: 'cardMentionRules',

  addOptions() {
    return {
      projectId: '',
      hydrate: async () => ({}),
    };
  },

  addInputRules() {
    const { projectId, hydrate } = this.options;
    return [
      // Bare key + trailing space:  "...COOP-123 "  →  pill + " "
      new InputRule({
        find: /(^|\s)([A-Z][A-Z0-9]{1,5}-\d+)\s$/,
        handler: ({ state, range, match, chain }) => {
          const leadingLen = (match[1] || '').length;
          const key = match[2];
          const replaceRange = clampRange(state, range.from + leadingLen, range.to);
          if (!replaceRange) return;
          chain()
            .insertContentAt(replaceRange, [
              { type: CardMention.name, attrs: { cardKey: key, projectId, title: null, columnName: null } },
              { type: 'text', text: ' ' },
            ])
            .run();
          fireHydrate([key], hydrate, this.editor);
        },
      }),
      // Card URL + trailing space. Recognises both URL forms:
      //   .../p/<projectId>/c/<KEY>                              (canonical)
      //   .../p/<projectId>/boards/<boardId>?card=<KEY>          (board form,
      //     which is what the address bar actually shows when a card is open)
      // The optional protocol://host prefix is consumed too so the editor
      // doesn't leave a stray `http://localhost:3000` text node behind.
      new InputRule({
        find: /(^|\s)((?:https?:\/\/[^\s/]+)?\/p\/([a-z0-9_-]+)\/(?:c\/([A-Z][A-Z0-9]{1,5}-\d+)|boards\/[a-z0-9_-]+\?card=([A-Z][A-Z0-9]{1,5}-\d+)))\s$/,
        handler: ({ state, range, match, chain }) => {
          const leadingLen = (match[1] || '').length;
          const matchedProjectId = match[3];
          const key = match[4] || match[5];
          if (!key) return;
          const replaceRange = clampRange(state, range.from + leadingLen, range.to);
          if (!replaceRange) return;
          chain()
            .insertContentAt(replaceRange, [
              { type: CardMention.name, attrs: { cardKey: key, projectId: matchedProjectId || projectId, title: null, columnName: null } },
              { type: 'text', text: ' ' },
            ])
            .run();
          fireHydrate([key], hydrate, this.editor);
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { projectId, hydrate } = this.options;
    const editorRef = this.editor;
    return [
      new Plugin({
        key: new PluginKey('cardMentionPaste'),
        props: {
          handlePaste: (_view, event) => {
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;
            const refs = extractCardRefs(text);
            if (refs.length === 0) return false;

            // Build a content array that interleaves text + CardMention nodes.
            const content: any[] = [];
            let cursor = 0;
            const keys: string[] = [];
            for (const ref of refs) {
              if (ref.index > cursor) {
                content.push({ type: 'text', text: text.slice(cursor, ref.index) });
              }
              content.push({
                type: CardMention.name,
                attrs: {
                  cardKey: ref.key,
                  projectId: ref.projectId || projectId,
                  title: null,
                  columnName: null,
                },
              });
              keys.push(ref.key);
              cursor = ref.index + ref.match.length;
            }
            if (cursor < text.length) {
              content.push({ type: 'text', text: text.slice(cursor) });
            }
            editorRef.chain().focus().insertContent(content).run();
            fireHydrate(keys, hydrate, editorRef);
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});

/** Resolve titles/statuses for newly inserted pills, then patch the editor's
 *  CardMention nodes in place. We walk the doc once and update any matching
 *  nodes regardless of position — handles the common case where the same key
 *  was inserted twice in close succession. */
async function fireHydrate(keys: string[], hydrate: HydrateFn, editor: Editor) {
  const dedup = [...new Set(keys)];
  if (dedup.length === 0) return;
  let resolved: Record<string, { title: string; columnName: string }>;
  try {
    resolved = await hydrate(dedup);
  } catch {
    return;
  }
  if (!editor || editor.isDestroyed) return;
  const tr = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== CardMention.name) return;
    const key = node.attrs.cardKey as string;
    const data = resolved[key];
    if (!data) return;
    if (node.attrs.title === data.title && node.attrs.columnName === data.columnName) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: data.title, columnName: data.columnName });
    changed = true;
  });
  if (changed) editor.view.dispatch(tr);
}

// Defensive: input rules occasionally fire with `range` values that fall outside
// the current doc — observed when the rule re-fires after a chain step has
// already reshaped the textblock, or when the regex anchors at a textblock
// boundary inside a nested node. Clamping to the doc bounds turns that into a
// no-op rather than letting ProseMirror throw "Position -X out of range".
function clampRange(state: { doc: { content: { size: number } } }, from: number, to: number): { from: number; to: number } | null {
  const max = state.doc.content.size;
  const f = Math.max(0, Math.min(from, max));
  const t = Math.max(f, Math.min(to, max));
  if (t === f) return null;
  return { from: f, to: t };
}

// Re-export for any caller that wants raw access to the regex patterns.
export type { CardRef };
