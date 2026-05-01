// Detection / extraction of card references from free text.
//
// Three forms are recognized:
//   1. Bare keys:           "COOP-123"
//   2. Card URLs:           ".../p/<projectId>/c/COOP-123"
//   3. MD-link wrap:        "[COOP-123](/p/<projectId>/c/COOP-123)" — what the
//                            editor's markdown serializer emits for pasted/
//                            inserted CardMention nodes
//
// All three reduce to the same { projectId?, key } pair. Bare-key references
// don't carry a projectId — the renderer fills that in from the surrounding
// context (the message's room/project) when looking up metadata.

const BARE_KEY = /\b([A-Z][A-Z0-9]{1,5}-\d+)\b/g;

// Card URLs come in two flavours:
//   1. Canonical: ".../p/<projectId>/c/<KEY>"
//   2. Board view: ".../p/<projectId>/boards/<boardId>?card=<KEY>"  ← what the
//      board page actually puts in the address bar when a card is open.
//
// Both must produce the same { projectId, key } and consume the FULL URL
// (including the optional protocol://host prefix) so the paste/input rules
// don't leave a half-URL behind in the editor.
//
// Match groups:
//   [1] projectId
//   [2] key (canonical form)  — undefined for board form
//   [3] key (board form)      — undefined for canonical form
const CARD_URL =
  /(?:https?:\/\/[^\s/]+)?\/p\/([a-z0-9_-]+)\/(?:c\/([A-Z][A-Z0-9]{1,5}-\d+)|boards\/[a-z0-9_-]+\?card=([A-Z][A-Z0-9]{1,5}-\d+))/g;

// Markdown-link wrapper around a card key, of the form `[KEY](url)` where the
// URL itself is one of the card forms above. This is what the editor's
// markdown serializer emits for CardMention nodes. We must treat the whole
// `[KEY](url)` substring as a single ref — without this, the bare-key inside
// `[KEY]` and the URL inside `(url)` both match independently and the
// renderer produces two pills bracketed by stray `[`, `](`, `)` glyphs.
//
// Match groups:
//   [1] key (from the visible `[KEY]` portion)
//   [2] full URL (consumed)
//   [3] projectId
const MD_LINK_TO_CARD =
  /\[([A-Z][A-Z0-9]{1,5}-\d+)\]\(((?:https?:\/\/[^\s)]+)?\/p\/([a-z0-9_-]+)\/(?:c\/[A-Z][A-Z0-9]{1,5}-\d+|boards\/[a-z0-9_-]+\?card=[A-Z][A-Z0-9]{1,5}-\d+))\)/g;

export interface CardRef {
  /** The matched key, e.g. "COOP-123" */
  key: string;
  /** Project id from the URL form, if known. Bare keys leave this undefined. */
  projectId?: string;
  /** Position in the source text — useful for renderers that need to splice. */
  index: number;
  /** The exact substring that matched (URL or bare key). */
  match: string;
}

/** Find all card references in `text`. Markdown-link wrappers take precedence
 *  over their inner URL/key parts; URL form takes precedence over bare keys
 *  that fall inside one — so each visible reference renders as exactly one
 *  pill with no leftover glyphs. */
export function extractCardRefs(text: string): CardRef[] {
  const refs: CardRef[] = [];
  const consumed: Array<{ start: number; end: number }> = [];

  // Pass 1 — markdown-link wrappers `[KEY](url)`.
  for (const m of text.matchAll(MD_LINK_TO_CARD)) {
    if (m.index === undefined) continue;
    const start = m.index;
    const end = start + m[0].length;
    refs.push({ key: m[1], projectId: m[3], index: start, match: m[0] });
    consumed.push({ start, end });
  }

  // Pass 2 — bare URL refs not inside a wrapper.
  for (const m of text.matchAll(CARD_URL)) {
    if (m.index === undefined) continue;
    if (consumed.some((u) => m.index! >= u.start && m.index! < u.end)) continue;
    const key = m[2] || m[3];
    if (!key) continue;
    refs.push({ key, projectId: m[1], index: m.index, match: m[0] });
    consumed.push({ start: m.index, end: m.index + m[0].length });
  }

  // Pass 3 — bare keys not inside a wrapper or URL.
  for (const m of text.matchAll(BARE_KEY)) {
    if (m.index === undefined) continue;
    if (consumed.some((u) => m.index! >= u.start && m.index! < u.end)) continue;
    refs.push({ key: m[1], index: m.index, match: m[0] });
  }

  return refs.sort((a, b) => a.index - b.index);
}

/** Quick boolean check — does the text contain at least one card reference? */
export function hasCardRef(text: string): boolean {
  BARE_KEY.lastIndex = 0;
  CARD_URL.lastIndex = 0;
  MD_LINK_TO_CARD.lastIndex = 0;
  return MD_LINK_TO_CARD.test(text) || CARD_URL.test(text) || BARE_KEY.test(text);
}

/** Just the unique keys in the text — for bulk metadata lookup. */
export function uniqueKeysIn(text: string): string[] {
  const set = new Set<string>();
  for (const r of extractCardRefs(text)) set.add(r.key);
  return [...set];
}
