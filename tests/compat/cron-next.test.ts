import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCronMatch, parseWhen, validateCron } from '../../src/lib/scheduler/cronNext';

const at = (iso: string) => new Date(iso);

test('every minute', () => {
  const next = nextCronMatch('* * * * *', at('2026-01-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-01-01T00:01:00.000Z');
});

test('every 5 minutes', () => {
  const next = nextCronMatch('*/5 * * * *', at('2026-01-01T00:02:00Z'));
  assert.equal(next.toISOString(), '2026-01-01T00:05:00.000Z');
});

test('weekly Monday 9am UTC', () => {
  const next = nextCronMatch('0 9 * * 1', at('2026-04-16T10:00:00Z'));
  // 2026-04-20 is Monday
  assert.equal(next.toISOString(), '2026-04-20T09:00:00.000Z');
});

test('validateCron rejects malformed', () => {
  assert.equal(validateCron('bad').ok, false);
  assert.equal(validateCron('* * *').ok, false);
  assert.equal(validateCron('* * * * *').ok, true);
  assert.equal(validateCron('*/15 * * * 1-5').ok, true);
});

test('parseWhen handles in:', () => {
  const now = new Date('2026-04-16T00:00:00Z');
  const w = parseWhen('in:2m', now);
  assert.equal(w.kind, 'one_shot');
  assert.equal(w.runAt!.toISOString(), '2026-04-16T00:02:00.000Z');
});

test('parseWhen handles at:', () => {
  const w = parseWhen('at:2026-04-16T12:00:00Z');
  assert.equal(w.kind, 'one_shot');
  assert.equal(w.runAt!.toISOString(), '2026-04-16T12:00:00.000Z');
});

test('parseWhen handles cron:', () => {
  const w = parseWhen('cron:*/10 * * * *');
  assert.equal(w.kind, 'recurring');
  assert.equal(w.cronExpr, '*/10 * * * *');
});

test('parseWhen rejects bare strings', () => {
  assert.throws(() => parseWhen('tomorrow'));
});
