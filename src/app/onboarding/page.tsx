// Server-rendered onboarding guide. Renders docs/getting-started.md inline so
// users don't need to bounce out of the app to read it. Reachable without auth
// — it's reference material and someone evaluating Co-Op should be able to
// read it before signing up.

import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// The marked → sanitize step here matches the chat pipeline's intent (no raw
// HTML, allowlist of safe tags), but the allowlist is wider since docs need
// tables and richer structure that chat doesn't.
const DOC_ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span',
  'strong', 'em', 'del', 's', 'code', 'pre', 'kbd',
  'blockquote',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
];
const DOC_ALLOWED_ATTR = ['href', 'title', 'class', 'rel', 'target', 'src', 'alt'];

function renderGuide(): string {
  const path = join(process.cwd(), 'docs/getting-started.md');
  const raw = readFileSync(path, 'utf8');
  const html = marked.parse(raw, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: DOC_ALLOWED_TAGS,
    ALLOWED_ATTR: DOC_ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|matrix):|[#/?])/i,
  });
}

export default function OnboardingPage() {
  const html = renderGuide();
  return (
    <div style={{ minHeight: '100vh', padding: 'var(--space-8) var(--space-4)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
          <Link href="/" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="text-xs text-tertiary">docs/getting-started.md</span>
        </div>
        <article
          className="prose"
          style={{
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-base)',
            lineHeight: 1.7,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
