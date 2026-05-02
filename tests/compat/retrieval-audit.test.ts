// Memory v4 / Phase 4 — retrieval audit aggregation.
//
// Tests aggregateRetrievalsByKey, the pure function that turns a list of
// memory_retrieved activity events into a per-key { count, recent[] } map
// for the harness UI's "pulled into N runs / 30d" badge. Logic was
// extracted from AgentHarnessModal specifically so it could be tested
// without React infrastructure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRetrievalsByKey } from '../../src/lib/retrievalAudit';

const NOW = new Date('2026-05-02T12:00:00Z').getTime();
const day = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

test('aggregates per-key counts within the 30-day window', () => {
  const events = [
    { createdAt: day(1), payload: { retrieved: [{ key: 'a', score: 0.9 }, { key: 'b', score: 0.8 }] } },
    { createdAt: day(5), payload: { retrieved: [{ key: 'a', score: 0.7 }] } },
    { createdAt: day(15), payload: { retrieved: [{ key: 'a', score: 0.5 }, { key: 'c', score: null }] } },
  ];
  const out = aggregateRetrievalsByKey(events, 30 * 24 * 60 * 60 * 1000, 3, NOW);
  assert.equal(out.a.count, 3, 'a appears in 3 events');
  assert.equal(out.b.count, 1);
  assert.equal(out.c.count, 1);
});

test('events outside the window are dropped', () => {
  const events = [
    { createdAt: day(1), payload: { retrieved: [{ key: 'recent', score: 0.9 }] } },
    { createdAt: day(45), payload: { retrieved: [{ key: 'old', score: 0.9 }] } },
  ];
  const out = aggregateRetrievalsByKey(events, 30 * 24 * 60 * 60 * 1000, 3, NOW);
  assert.ok('recent' in out);
  assert.ok(!('old' in out), 'events older than the window must be dropped');
});

test('recent[] retains at most N timestamps per key, in event order', () => {
  // 5 events, all referencing key 'x' — recent should keep the first 3
  // (events array as ingested; caller is expected to pass events in the
  // order they want; the harness fetches createdAt-desc so newest first).
  const events = [
    { createdAt: day(1), payload: { retrieved: [{ key: 'x', score: 0.95 }] } },
    { createdAt: day(2), payload: { retrieved: [{ key: 'x', score: 0.85 }] } },
    { createdAt: day(3), payload: { retrieved: [{ key: 'x', score: 0.75 }] } },
    { createdAt: day(4), payload: { retrieved: [{ key: 'x', score: 0.65 }] } },
    { createdAt: day(5), payload: { retrieved: [{ key: 'x', score: 0.55 }] } },
  ];
  const out = aggregateRetrievalsByKey(events, 30 * 24 * 60 * 60 * 1000, 3, NOW);
  assert.equal(out.x.count, 5);
  assert.equal(out.x.recent.length, 3);
  // First three (most-recent if events came in createdAt-desc order, which
  // is what the activity endpoint returns).
  assert.equal(out.x.recent[0].ts, day(1));
  assert.equal(out.x.recent[2].ts, day(3));
});

test('null scores survive the aggregation (always-include rows)', () => {
  // Preference rows + recent-decision rows have no score (they bypass the
  // top-K cosine ranking). The aggregator must preserve null without
  // crashing or coercing to 0.
  const events = [
    { createdAt: day(1), payload: { retrieved: [{ key: 'pref-tone', score: null }] } },
  ];
  const out = aggregateRetrievalsByKey(events, 30 * 24 * 60 * 60 * 1000, 3, NOW);
  assert.equal(out['pref-tone'].count, 1);
  assert.equal(out['pref-tone'].recent[0].score, null);
});

test('malformed event payloads are tolerated (no crash)', () => {
  const events = [
    { createdAt: day(1), payload: null },
    { createdAt: day(1), payload: {} },
    { createdAt: day(1), payload: { retrieved: null } },
    { createdAt: day(1), payload: { retrieved: [{ score: 0.5 }] } }, // missing key
    { createdAt: 'not-a-date', payload: { retrieved: [{ key: 'x' }] } },
    { createdAt: day(1), payload: { retrieved: [{ key: 'x', score: 0.9 }] } },
  ];
  const out = aggregateRetrievalsByKey(events, 30 * 24 * 60 * 60 * 1000, 3, NOW);
  // Only the valid trailing event should land in the map.
  assert.equal(Object.keys(out).length, 1);
  assert.equal(out.x.count, 1);
});

test('empty event list produces empty map', () => {
  assert.deepEqual(aggregateRetrievalsByKey([], 30 * 24 * 60 * 60 * 1000, 3, NOW), {});
});

test('windowMs and recentPerKey are configurable', () => {
  const events = [
    { createdAt: day(0.5), payload: { retrieved: [{ key: 'k', score: 0.9 }] } },
    { createdAt: day(1.5), payload: { retrieved: [{ key: 'k', score: 0.8 }] } },
    { createdAt: day(2.5), payload: { retrieved: [{ key: 'k', score: 0.7 }] } },
  ];
  // 24h window, only events within last day count
  const oneDayMs = 24 * 60 * 60 * 1000;
  const out = aggregateRetrievalsByKey(events, oneDayMs, 1, NOW);
  assert.equal(out.k.count, 1, 'only the day-0.5 event is inside a 1-day window');
  assert.equal(out.k.recent.length, 1);
});
