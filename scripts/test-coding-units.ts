// Pure-function smoke tests for the Phase 2–5 coding stack.
// Run with: npx tsx scripts/test-coding-units.ts
import assert from 'node:assert/strict';

process.env.GITHUB_APP_WEBHOOK_SECRET ||= 'test-webhook-secret';
process.env.COOP_WORKER_SECRET ||= 'test-worker-secret';

import { commentHasStartIntent } from '../src/lib/coding/triggers';
import { runIdFromBranch } from '../src/lib/coding/webhookHandler';
import { mintBriefToken, verifyBriefToken, verifyWebhookSignature } from '../src/lib/coding/githubApp';
import { signBody, verifySignature } from '../src/lib/coding/workerHmac';
import crypto from 'node:crypto';

const cases: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>) { cases.push([name, fn]); }

test('commentHasStartIntent: positives', () => {
  assert.equal(commentHasStartIntent('@coder start'), true);
  assert.equal(commentHasStartIntent('hey @bot go please'), true);
  assert.equal(commentHasStartIntent('@dev_agent ship it'), true);
  assert.equal(commentHasStartIntent('@x execute now'), true);
});

test('commentHasStartIntent: negatives', () => {
  assert.equal(commentHasStartIntent('@coder thanks'), false);
  assert.equal(commentHasStartIntent('start without mention'), false);
  assert.equal(commentHasStartIntent(''), false);
});

test('runIdFromBranch', () => {
  assert.equal(runIdFromBranch('coop/run-abc123'), 'abc123');
  assert.equal(runIdFromBranch('coop/run-cl_xyz_999'), 'cl_xyz_999');
  assert.equal(runIdFromBranch('main'), null);
  assert.equal(runIdFromBranch('feature/coop'), null);
  assert.equal(runIdFromBranch(undefined), null);
});

test('brief token: roundtrip + tamper resistance', () => {
  const tok = mintBriefToken('run123', 60);
  assert.equal(verifyBriefToken(tok, 'run123'), true);
  assert.equal(verifyBriefToken(tok, 'other-run'), false);
  // tamper with sig
  const parts = tok.split('.');
  parts[2] = parts[2].replace(/.$/, parts[2].endsWith('a') ? 'b' : 'a');
  assert.equal(verifyBriefToken(parts.join('.'), 'run123'), false);
});

test('brief token: expiry', () => {
  // mint with 1s ttl, wait... easier to construct manually with a past exp
  const exp = Math.floor(Date.now() / 1000) - 10;
  const sig = crypto.createHmac('sha256', process.env.GITHUB_APP_WEBHOOK_SECRET!).update(`run123.${exp}`).digest('hex');
  assert.equal(verifyBriefToken(`run123.${exp}.${sig}`, 'run123'), false);
});

test('github webhook signature', () => {
  const body = '{"hello":"world"}';
  const sig = 'sha256=' + crypto.createHmac('sha256', process.env.GITHUB_APP_WEBHOOK_SECRET!).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig), true);
  assert.equal(verifyWebhookSignature(body, sig.replace(/.$/, 'x')), false);
  assert.equal(verifyWebhookSignature(body, null), false);
});

test('worker HMAC: roundtrip', () => {
  const body = JSON.stringify({ runId: 'r1', status: 'pr_opened' });
  const { header } = signBody(body);
  assert.equal(verifySignature(body, header), true);
  assert.equal(verifySignature(body + 'x', header), false);
  assert.equal(verifySignature(body, header.replace(/v1=.*/, 'v1=deadbeef')), false);
});

test('worker HMAC: rejects skewed timestamps', () => {
  const body = JSON.stringify({ runId: 'r1' });
  const old = Math.floor(Date.now() / 1000) - 1000;
  const sig = crypto.createHmac('sha256', process.env.COOP_WORKER_SECRET!).update(`${old}.${body}`).digest('hex');
  assert.equal(verifySignature(body, `t=${old},v1=${sig}`), false);
});

(async () => {
  let pass = 0, fail = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      pass++;
    } catch (err: any) {
      console.error(`✗ ${name}\n  ${err?.message || err}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
