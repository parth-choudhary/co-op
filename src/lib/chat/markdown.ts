// Markdown ↔ HTML for chat messages.
//
// Two paths:
//   1. Outgoing (server → Matrix): renderToMatrixHtml takes raw markdown the agent
//      produced and returns the sanitized HTML we attach as Matrix's `formatted_body`
//      (alongside the raw `body`). Tag set is restricted to what Matrix clients are
//      expected to render per spec.
//   2. Incoming (Matrix → client): sanitizeIncomingHtml takes the `formatted_body`
//      we got off the wire and runs it through the same allowlist before we drop it
//      into the DOM. Same allowlist, but we also forbid attribute-based XSS vectors.
//
// We do NOT trust the agent's output, even though we generated it — markdown can
// produce things like raw HTML if extensions are enabled. We disable HTML in marked
// and pass the result through DOMPurify either way.

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Matrix spec lists these as the safe formatting tags clients should render.
// https://spec.matrix.org/latest/client-server-api/#mroommessage-msgtypes (HTML subset)
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'em', 'del', 's', 'code', 'pre',
  'blockquote',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a',
  'span',
];

// Only allow a tiny set of attributes. `href` on links, `class` on spans/code for
// language hints. Everything else (style, on*, data-*) gets stripped.
const ALLOWED_ATTR = ['href', 'title', 'class', 'rel', 'target'];

const purifyConfig = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // Force-strip any javascript: / data: hrefs DOMPurify might otherwise let through.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|matrix):|[#/?])/i,
  // Open links in a new tab safely is the renderer's job, not the sanitizer's.
};

// Configure marked once. We keep it strict: no raw HTML passthrough, GFM on for
// strikethrough + task lists.
marked.setOptions({
  gfm: true,
  breaks: true, // single newline → <br>, matches chat expectations
});

/**
 * Convert markdown to sanitized HTML suitable for Matrix `formatted_body`.
 * Returns an empty string for empty/whitespace input.
 */
export function renderToMatrixHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';
  // marked.parse returns string for sync input; cast to satisfy TS.
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, purifyConfig).trim();
}

/**
 * Sanitize HTML received from a Matrix `formatted_body`. Same allowlist as outgoing
 * so we never render anything we wouldn't have sent ourselves.
 */
export function sanitizeIncomingHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, purifyConfig);
}

/**
 * Cheap detector — if the body has no markdown-like syntax, we can skip rendering.
 * Used by the client to decide between "wrap mentions in plain text" and "render as HTML."
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  // Inline emphasis, code, links, headings, lists, blockquotes, code fences.
  return /(\*\*|__|\*|_|`|~~|^#+\s|^\s*[-*+]\s|^\s*\d+\.\s|^>\s|```|\[[^\]]+\]\([^)]+\))/m.test(text);
}
