// Verifies that a schedule_task invocation captures the delivery target (chat
// room / card) from the ambient RunContext so the cron tick knows where to
// post the reminder. This is the specific bug that caused "CMO said 'I
// scheduled it' but then 2 minutes later nothing happened."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedulerPlugin } from '../../src/lib/plugins/builtin/scheduler';
import type { PluginToolContext } from '../../src/lib/plugins/contract';

// Minimal prisma mock for the one call site we care about.
const captured: any[] = [];
const fakePrisma: any = {
  scheduledJob: {
    create: async ({ data, select }: any) => {
      captured.push(data);
      return {
        id: 'job_1',
        nextRunAt: data.nextRunAt,
        kind: data.kind,
        cronExpr: data.cronExpr,
        title: data.title,
      };
    },
  },
};

// Swap the db module the handler imports. tsx resolves `../../db` relative
// to src/lib/plugins/builtin/scheduler.ts which is src/lib/db. We monkeypatch
// the already-imported module record.
import dbModule from '../../src/lib/db';
(dbModule as any).scheduledJob = fakePrisma.scheduledJob;

test('schedule_task persists delivery from chat ctx into ScheduledJob.payload', async () => {
  captured.length = 0;
  const scheduleTool = schedulerPlugin.tools!.find((t) => t.name === 'schedule_task')!;
  const ctx: PluginToolContext = {
    agentId: 'agent_a',
    projectId: 'proj_x',
    runId: 'run_1',
    delivery: { matrixRoomId: '!room:hs', roomId: 'room_db_id' },
  };
  const res = await scheduleTool.handler(ctx, {
    when: 'in:2m',
    prompt: 'Remind Parth to drink water',
    title: 'Water reminder',
  });
  assert.equal(res.ok, true, `handler failed: ${res.error || ''}`);
  assert.equal(captured.length, 1);
  const saved = captured[0];
  assert.equal(saved.prompt, 'Remind Parth to drink water');
  assert.equal(saved.title, 'Water reminder');
  assert.ok(saved.payload, 'payload must be persisted for delivery');
  assert.equal(saved.payload.matrixRoomId, '!room:hs');
  assert.equal(saved.payload.roomId, 'room_db_id');
});

test('schedule_task falls back to card delivery when cardId is in ctx', async () => {
  captured.length = 0;
  const scheduleTool = schedulerPlugin.tools!.find((t) => t.name === 'schedule_task')!;
  const ctx: PluginToolContext = {
    agentId: 'agent_a',
    projectId: 'proj_x',
    delivery: { cardId: 'card_123', replyToCommentId: 'comment_456' },
  };
  const res = await scheduleTool.handler(ctx, {
    when: 'in:5m',
    prompt: 'Check the PR status',
  });
  assert.equal(res.ok, true, `handler failed: ${res.error || ''}`);
  const saved = captured[0];
  assert.equal(saved.cardId, 'card_123', 'cardId from delivery should land on the job');
  assert.equal(saved.payload.replyToCommentId, 'comment_456');
  assert.equal(saved.kind, 'reminder');
});

test('schedule_task with no delivery context still works (degrades gracefully)', async () => {
  captured.length = 0;
  const scheduleTool = schedulerPlugin.tools!.find((t) => t.name === 'schedule_task')!;
  const ctx: PluginToolContext = { agentId: 'a', projectId: 'p' };
  const res = await scheduleTool.handler(ctx, { when: 'in:1h', prompt: 'test' });
  assert.equal(res.ok, true);
  const saved = captured[0];
  assert.equal(saved.payload.matrixRoomId, null);
  assert.equal(saved.payload.roomId, null);
  assert.equal(saved.payload.replyToCommentId, null);
  assert.equal(saved.kind, 'one_shot');
});
