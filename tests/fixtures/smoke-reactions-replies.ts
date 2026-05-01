// Smoke: post a parent message as the CMO agent, then send a reply that
// references it via in_reply_to, then send two reactions on the parent. Read
// each event back to confirm the relations + payloads are well-formed.
//
//   npx tsx tests/fixtures/smoke-reactions-replies.ts

import 'dotenv/config';
import prisma from '../../src/lib/db';
import { tryDecrypt } from '../../src/lib/crypto';
import { sendMessage, sendReply, sendReaction, redactEvent } from '../../src/lib/matrix';

const AGENT_ID = 'cmnyvhqx30006oag6upib3tz4';        // CMO Agent
const MATRIX_ROOM = '!ifnaphgiWABAPtaiEQ:coop.local';
const ADMIN = process.env.MATRIX_ADMIN_TOKEN!;

async function readEvent(eventId: string) {
  const r = await fetch(`http://localhost:8008/_matrix/client/v3/rooms/${encodeURIComponent(MATRIX_ROOM)}/event/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
  return r.json();
}

async function main() {
  const agent = await prisma.aIAgent.findUnique({ where: { id: AGENT_ID } });
  const token = tryDecrypt(agent!.matrixAccessToken!);
  if (!token) throw new Error('decrypt failed');

  // Parent
  const parent = await sendMessage(MATRIX_ROOM, token, 'Original message — :rocket: ship it!');
  console.log('parent →', parent.event_id);
  const parentEv = await readEvent(parent.event_id);

  // Reply
  const reply = await sendReply(MATRIX_ROOM, token, 'Replying with **markdown** and :fire:.', {
    eventId: parent.event_id,
    sender: parentEv.sender,
    body: parentEv.content.body,
  });
  console.log('reply  →', reply.event_id);
  const replyEv = await readEvent(reply.event_id);
  const inReplyTo = replyEv.content?.['m.relates_to']?.['m.in_reply_to']?.event_id;
  console.log('  in_reply_to:', inReplyTo);
  console.log('  has mx-reply HTML:', /mx-reply/.test(replyEv.content?.formatted_body || ''));

  // Two reactions on the parent
  const r1 = await sendReaction(MATRIX_ROOM, token, parent.event_id, '👍');
  const r2 = await sendReaction(MATRIX_ROOM, token, parent.event_id, '🔥');
  console.log('reaction 👍 →', r1.event_id);
  console.log('reaction 🔥 →', r2.event_id);
  const r1Ev = await readEvent(r1.event_id);
  console.log('  reaction relates_to:', JSON.stringify(r1Ev.content));

  // Redact the 👍 to verify the toggle path
  await redactEvent(MATRIX_ROOM, token, r1.event_id, 'undo');
  console.log('redacted 👍');
  const r1After = await readEvent(r1.event_id);
  console.log('  after redact, content keys:', Object.keys(r1After.content || {}));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
