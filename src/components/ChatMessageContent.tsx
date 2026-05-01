'use client';

// Chat-message body renderer. Sits alongside MessageBody — the difference is
// the source format: chat messages may carry pre-rendered HTML (from markdown
// or sender-supplied formatted_body), so we post-process that HTML to wrap
// card-key references in pill chips. MessageBody is for plain-text bodies
// (card comments) where we can render JSX directly.
//
// Pills here are plain `<a>` chips styled via CSS — no React component per
// pill — because injecting components into a dangerouslySetInnerHTML stream
// requires HTML→React parsing we don't want to take on yet. They still
// navigate to the canonical /c/<key> URL and pick up title via async fetch.

import { useEffect, useMemo, useState } from 'react';
import { uniqueKeysIn } from '@/lib/cardLinks';
import { pathForCardKey } from '@/lib/appRoutes';

interface Props {
  /** Pre-rendered HTML for the message body. Caller is responsible for sanitizing. */
  html: string;
  /** Raw text content — used only for key extraction (HTML may have escaped them). */
  rawText: string;
  /** Project context for resolving keys. */
  projectId: string;
  /** Wrapper className. */
  className?: string;
}

interface Meta { id: string; title: string; columnName: string; boardId: string; url: string; }

export default function ChatMessageContent({ html, rawText, projectId, className }: Props) {
  const keys = useMemo(() => uniqueKeysIn(rawText), [rawText]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});

  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    fetch('/api/cards/resolve-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, keys }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.cards) setMeta(data.cards); })
      .catch(() => { /* keep raw HTML — pills degrade to plain links */ });
    return () => { cancelled = true; };
  }, [projectId, keys.join(',')]);

  const enriched = useMemo(() => injectPillsIntoHtml(html, projectId, meta), [html, projectId, meta]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: enriched }} />;
}

/**
 * Two passes over the HTML string:
 *
 *   1. Replace any `<a href=".../c/KEY">…</a>` link with a pill anchor, regardless
 *      of the original anchor text. This handles canonical card URLs that the
 *      markdown renderer auto-linked.
 *
 *   2. For text nodes (between tags), wrap bare-key matches like "COOP-123" in
 *      pill anchors. We approximate "text node" with a regex that skips
 *      content inside angle brackets — sufficient for our sanitized-HTML
 *      output, which has no nested attributes carrying card-key strings.
 *
 * Title text is taken from `meta` when available; otherwise the chip just
 * shows the key.
 */
function injectPillsIntoHtml(html: string, projectId: string, meta: Record<string, Meta>): string {
  // Pass 1: card URLs → pill anchors. Recognises both canonical /c/<KEY> and
  // the board-view ?card=<KEY> form (which is what the address bar actually
  // contains when a card modal is open).
  const urlRe = /<a[^>]*href="(?:[^"]*)?\/p\/([a-z0-9_-]+)\/(?:c\/([A-Z][A-Z0-9]{1,5}-\d+)|boards\/[a-z0-9_-]+\?card=([A-Z][A-Z0-9]{1,5}-\d+))"[^>]*>[^<]*<\/a>/g;
  let out = html.replace(urlRe, (_full, urlProjectId: string, canonicalKey: string | undefined, boardKey: string | undefined) => {
    const key = canonicalKey || boardKey;
    if (!key) return _full;
    return pillAnchor({ key, projectId: urlProjectId, meta: meta[key] });
  });

  // Pass 2: bare keys in text segments. Split on tags so we don't touch
  // anything inside markup.
  const parts = out.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.startsWith('<')) continue; // tag, skip
    parts[i] = seg.replace(/\b([A-Z][A-Z0-9]{1,5}-\d+)\b/g, (match, key: string) => {
      return pillAnchor({ key, projectId, meta: meta[key] });
    });
  }
  out = parts.join('');
  return out;
}

function pillAnchor(args: { key: string; projectId: string; meta?: Meta }): string {
  const href = args.meta?.url || pathForCardKey(args.projectId, args.key);
  const title = args.meta?.title ? escapeAttr(args.meta.title) : args.key;
  const status = args.meta?.columnName ? escapeHtml(args.meta.columnName) : '';
  const titleAttr = args.meta ? `${args.key} · ${escapeAttr(args.meta.columnName || '')}` : args.key;
  // The structure mirrors CardKeyPill so the same CSS rules apply.
  return [
    `<a class="card-pill" data-known="${args.meta ? 'true' : 'false'}" href="${escapeAttr(href)}" title="${escapeAttr(titleAttr)}">`,
    `<span class="card-pill-key">${escapeHtml(args.key)}</span>`,
    args.meta ? `<span class="card-pill-title">${escapeHtml(args.meta.title)}</span>` : '',
    status ? `<span class="card-pill-status">${status}</span>` : '',
    `</a>`,
  ].join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
}
function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
}
