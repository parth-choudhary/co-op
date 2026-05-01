// Compat test for the chat markdown layer. Locks in:
//   - Outgoing markdown → sanitized HTML produces the right tags for common syntax
//   - Empty / plain text don't get HTML wrapping noise
//   - XSS surfaces (script tags, javascript: hrefs, on* handlers) get stripped
//   - Incoming HTML is sanitized to the same allowlist
//   - looksLikeMarkdown gates the cheap "skip rendering" path correctly

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToMatrixHtml, sanitizeIncomingHtml, looksLikeMarkdown } from '../../src/lib/chat/markdown';

test('renders bold/italic/code', () => {
  const html = renderToMatrixHtml('**bold** *italic* `code`');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
});

test('renders unordered and ordered lists', () => {
  const ul = renderToMatrixHtml('- one\n- two');
  assert.match(ul, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  const ol = renderToMatrixHtml('1. first\n2. second');
  assert.match(ol, /<ol[\s\S]*<li>first<\/li>[\s\S]*<li>second<\/li>[\s\S]*<\/ol>/);
});

test('renders fenced code block as <pre><code>', () => {
  const html = renderToMatrixHtml('```\nconst x = 1;\n```');
  assert.match(html, /<pre><code/);
  assert.match(html, /const x = 1;/);
});

test('renders blockquote and headings', () => {
  assert.match(renderToMatrixHtml('> quoted'), /<blockquote>[\s\S]*quoted/);
  assert.match(renderToMatrixHtml('# Heading'), /<h1>Heading<\/h1>/);
});

test('renders links with safe href schemes', () => {
  const html = renderToMatrixHtml('[click](https://example.com)');
  assert.match(html, /<a[^>]+href="https:\/\/example\.com"/);
});

test('strips javascript: hrefs', () => {
  const html = renderToMatrixHtml('[bad](javascript:alert(1))');
  // The href is stripped or the whole anchor sanitized — either way no executable URI.
  assert.ok(!/javascript:/i.test(html), `javascript: URI leaked: ${html}`);
});

test('strips raw <script> tags', () => {
  const html = renderToMatrixHtml('hello <script>alert(1)</script> world');
  assert.ok(!/<script/i.test(html), `<script> survived: ${html}`);
  assert.match(html, /hello/);
});

test('strips on* event handlers from inline html', () => {
  const html = sanitizeIncomingHtml('<p onclick="alert(1)">hi</p>');
  assert.ok(!/onclick/i.test(html), `onclick survived: ${html}`);
  assert.match(html, /<p>hi<\/p>/);
});

test('empty input → empty string', () => {
  assert.equal(renderToMatrixHtml(''), '');
  assert.equal(renderToMatrixHtml('   '), '');
});

test('looksLikeMarkdown detects common syntax', () => {
  assert.equal(looksLikeMarkdown('**hi**'), true);
  assert.equal(looksLikeMarkdown('plain hello world'), false);
  assert.equal(looksLikeMarkdown('a `code` snippet'), true);
  assert.equal(looksLikeMarkdown('# Heading'), true);
  assert.equal(looksLikeMarkdown('- list item'), true);
  assert.equal(looksLikeMarkdown('> quoted'), true);
  assert.equal(looksLikeMarkdown('see [link](https://x.com)'), true);
  // Email-ish text shouldn't false-positive as markdown
  assert.equal(looksLikeMarkdown('email me at user@example.com'), false);
});

test('sanitizeIncomingHtml allows formatting tags', () => {
  const html = sanitizeIncomingHtml('<p><strong>x</strong> <em>y</em> <code>z</code></p>');
  assert.match(html, /<strong>x<\/strong>/);
  assert.match(html, /<em>y<\/em>/);
  assert.match(html, /<code>z<\/code>/);
});

test('sanitizeIncomingHtml strips disallowed tags but keeps text', () => {
  const html = sanitizeIncomingHtml('<iframe src="evil"></iframe>hello');
  assert.ok(!/iframe/i.test(html), `iframe survived: ${html}`);
  assert.match(html, /hello/);
});
