'use client';

// Inline card-reference pill, like Linear/Trello renders for ticket links.
// Displays "<KEY> <Title>" with a small status badge. Clickable — navigates to
// the canonical /c/<key> URL which redirects to the board with the modal open.
//
// `meta` is the per-key metadata fetched in bulk by MessageBody. When meta is
// not yet loaded (or the lookup failed), we fall back to a plain monospace
// chip showing just the key.

import Link from 'next/link';

export interface CardPillMeta {
  id: string;
  title: string;
  columnName: string;
  boardId: string;
  url: string;
}

interface Props {
  cardKey: string;
  meta?: CardPillMeta;
  /** Optional fallback href if we couldn't resolve metadata. */
  fallbackHref?: string;
}

export default function CardKeyPill({ cardKey, meta, fallbackHref }: Props) {
  const href = meta?.url || fallbackHref || '#';
  const known = !!meta;
  return (
    <Link
      href={href}
      className="card-pill"
      data-known={known ? 'true' : 'false'}
      title={meta ? `${cardKey} · ${meta.columnName}` : cardKey}
    >
      <span className="card-pill-key">{cardKey}</span>
      {meta && <span className="card-pill-title">{meta.title}</span>}
      {meta?.columnName && <span className="card-pill-status">{meta.columnName}</span>}
    </Link>
  );
}
