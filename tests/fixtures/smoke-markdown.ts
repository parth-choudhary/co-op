// One-off smoke test: post a markdown message via lib/matrix.sendMessage as the
// CMO agent, then read the most recent event back from the homeserver and verify
// it carries `format: org.matrix.custom.html` + a sane `formatted_body`.
//
// Run from repo root:  npx tsx tests/fixtures/smoke-markdown.mjs

import 'dotenv/config';
import prisma from '../../src/lib/db';
import { tryDecrypt } from '../../src/lib/crypto';
import { sendMessage } from '../../src/lib/matrix';

const ROOM_ID_DB = 'cmnz3gd4k0000aog6dfwvtrgo';      // DM channel row id (unused but documents context)
const AGENT_ID = 'cmnyvhqx30006oag6upib3tz4';        // CMO Agent
const MATRIX_ROOM = '!ifnaphgiWABAPtaiEQ:coop.local';

async function main() {
  const agent = await prisma.aIAgent.findUnique({ where: { id: AGENT_ID } });
  const token = tryDecrypt(agent!.matrixAccessToken!);
  if (!token) throw new Error('decrypt failed');

  const md = '## Smoke test\n\nThis has **bold**, *italic*, `code`, and a [link](https://example.com).\n\n- one\n- two\n\n```\nconst x = 1;\n```';
  const r1 = await sendMessage(MATRIX_ROOM, token, md);
  console.log('m.text  →', r1.event_id);

  // m.notice: rendered muted/italic; should still get formatted_body
  const r2 = await sendMessage(MATRIX_ROOM, token, '_System notice:_ build **succeeded** in 12s.', 'm.notice');
  console.log('m.notice→', r2.event_id);

  // m.emote: rendered as "* Sender ..." with markdown inside
  const r3 = await sendMessage(MATRIX_ROOM, token, 'reviews the *PR* and approves it', 'm.emote');
  console.log('m.emote →', r3.event_id);

  const ADMIN = process.env.MATRIX_ADMIN_TOKEN;
  for (const [label, id] of [['text', r1.event_id], ['notice', r2.event_id], ['emote', r3.event_id]] as const) {
    const resp = await fetch(`http://localhost:8008/_matrix/client/v3/rooms/${encodeURIComponent(MATRIX_ROOM)}/event/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${ADMIN}` },
    });
    const ev = await resp.json();
    console.log(`--- ${label} content ---`);
    console.log(JSON.stringify(ev.content, null, 2));
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
