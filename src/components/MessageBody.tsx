'use client';

// Shared renderer for chat messages and card comments. Replaces the ad-hoc
// inline string-splitting that lived in the chat page and CardDetailModal.
//
// Handles:
//   - @mentions (rendered as accent-colored span)
//   - card references — bare keys ("COOP-123") and canonical URLs
//     (".../p/<projectId>/c/COOP-123") — collapsed into CardKeyPill
//
// Pill metadata is fetched in bulk per render: for the keys that appear in
// `text`, we POST to /api/cards/resolve-keys?projectId=... and cache the
// result for the lifetime of the component instance. Stale data isn't a
// concern here — pills reflect title at fetch time, the link is canonical.

import { useEffect, useMemo, useState } from 'react';
import { extractCardRefs, uniqueKeysIn } from '@/lib/cardLinks';
import CardKeyPill, { type CardPillMeta } from './CardKeyPill';

interface Props {
  text: string;
  /** Project context for resolving bare card keys to titles. Required. */
  projectId: string;
  /** Optional CSS class for the wrapper span. */
  className?: string;
}

export default function MessageBody({ text, projectId, className }: Props) {
  const keys = useMemo(() => uniqueKeysIn(text), [text]);
  const [meta, setMeta] = useState<Record<string, CardPillMeta>>({});

  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    fetch('/api/cards/resolve-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, keys }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.cards) return;
        setMeta(data.cards);
      })
      .catch(() => { /* fall back silently to bare-key rendering */ });
    return () => { cancelled = true; };
  }, [projectId, keys.join(',')]);

  return <span className={className}>{renderInline(text, meta)}</span>;
}

/**
 * Walk the text once, splicing pills for card refs and accent spans for
 * @mentions. Everything in between is rendered as plain text.
 *
 * Card refs take precedence: if a URL contains a key and the bare key also
 * matches, extractCardRefs already de-duped them.
 */
function renderInline(text: string, meta: Record<string, CardPillMeta>): React.ReactNode[] {
  const refs = extractCardRefs(text);
  const out: React.ReactNode[] = [];
  let cursor = 0;

  const pushPlain = (chunk: string, baseKey: number) => {
    if (!chunk) return;
    // Inline @mentions inside the plain segments.
    const parts = chunk.split(/(@[\w.\-:]+)/g);
    parts.forEach((part, i) => {
      if (part.startsWith('@')) {
        out.push(<span key={`m-${baseKey}-${i}`} className="mention">{part}</span>);
      } else if (part) {
        out.push(<span key={`t-${baseKey}-${i}`}>{part}</span>);
      }
    });
  };

  refs.forEach((ref, i) => {
    pushPlain(text.slice(cursor, ref.index), i);
    out.push(
      <CardKeyPill
        key={`p-${i}-${ref.key}-${ref.index}`}
        cardKey={ref.key}
        meta={meta[ref.key]}
        fallbackHref={ref.match.startsWith('/') || ref.match.startsWith('http') ? ref.match : undefined}
      />,
    );
    cursor = ref.index + ref.match.length;
  });
  pushPlain(text.slice(cursor), refs.length);

  return out;
}
