import 'dotenv/config';
import prisma from '../src/lib/db';
import { runAgent } from '../src/lib/agentRunner';

const PROJECT_ID = 'cmnyrycp40000kag6ki3yckd2';
const AGENT_ID = 'cmnyvhqx30006oag6upib3tz4'; // CMO Agent
const CARD_ID = 'cmnys33ue0007kag65o34rovo'; // "sadf" in To Do

function check(label: string, cond: boolean, detail?: any) {
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}`, detail ? JSON.stringify(detail, null, 2) : '');
  if (!cond) process.exitCode = 1;
}

async function findDoneColumnForCardBoard(cardId: string) {
  const c = await prisma.card.findUnique({ where: { id: cardId }, include: { column: true } });
  if (!c) throw new Error('card missing');
  const done = await prisma.column.findFirst({ where: { boardId: c.column.boardId, name: { equals: 'Done', mode: 'insensitive' } } });
  if (!done) throw new Error('no Done column on board');
  return done;
}

async function main() {
  console.log('=== Agent Runtime Smoke Test ===\n');

  // Reset: put card back to To Do before run
  const beforeCard = await prisma.card.findUnique({ where: { id: CARD_ID }, include: { column: true } });
  if (!beforeCard) throw new Error('test card missing');
  console.log(`Start: card "${beforeCard.title}" in column "${beforeCard.column.name}"\n`);

  const done = await findDoneColumnForCardBoard(CARD_ID);

  // Test 1: plain reply (no tools)
  console.log('Test 1: Plain reply (tools disabled)');
  const r1 = await runAgent({
    agentId: AGENT_ID,
    userPrompt: 'Reply with exactly the word: pong',
    enableTools: false,
  });
  check('  responds with text', r1.text.length > 0, { text: r1.text.slice(0, 80) });

  // Test 2: list_cards tool
  console.log('\nTest 2: list_cards via tool use');
  const r2 = await runAgent({
    agentId: AGENT_ID,
    userPrompt: 'Call list_cards to list cards in the project. Then reply with the count of cards you see.',
  });
  const usedAnyListing = r2.toolResults?.some(t => ['list_cards', 'list_boards', 'list_columns'].includes(t.tool));
  check('  invoked a listing tool', !!usedAnyListing, { tools: r2.toolResults?.map(t => t.tool) });

  // Test 3: move_card to Done (give the exact columnId to keep the test deterministic)
  console.log('\nTest 3: move_card to Done');
  const r3 = await runAgent({
    agentId: AGENT_ID,
    userPrompt: `Move card id ${CARD_ID} to column id ${done.id} using the move_card tool. Confirm when finished.`,
  });
  const movedAction = r3.toolResults?.find(t => t.tool === 'move_card');
  check('  invoked move_card', !!movedAction, { actions: r3.toolResults?.map(t => t.tool) });
  const afterCard = await prisma.card.findUnique({ where: { id: CARD_ID } });
  check('  card now in Done column', afterCard?.columnId === done.id, { columnId: afterCard?.columnId, expected: done.id });

  // Test 4: add_comment
  console.log('\nTest 4: add_comment');
  const r4 = await runAgent({
    agentId: AGENT_ID,
    userPrompt: `Add a comment to card ${CARD_ID} saying: "Done by agent smoke test". Use add_comment.`,
  });
  const commented = r4.toolResults?.some(t => t.tool === 'add_comment');
  check('  invoked add_comment', !!commented);
  const latestComment = await prisma.comment.findFirst({ where: { cardId: CARD_ID, authorType: 'agent', authorId: AGENT_ID }, orderBy: { createdAt: 'desc' } });
  check('  comment persisted', !!latestComment && latestComment.content.includes('smoke test'), { content: latestComment?.content });

  // Test 5: update_card (title)
  console.log('\nTest 5: update_card');
  const newTitle = `sadf [verified ${Date.now()}]`;
  const r5 = await runAgent({
    agentId: AGENT_ID,
    userPrompt: `Update card ${CARD_ID} to set its title to exactly: ${newTitle}`,
  });
  const updated = r5.toolResults?.some(t => t.tool === 'update_card');
  check('  invoked update_card', !!updated);
  const afterUpdate = await prisma.card.findUnique({ where: { id: CARD_ID } });
  check('  title was updated', afterUpdate?.title === newTitle, { title: afterUpdate?.title });

  // Cleanup: restore original column + title
  await prisma.card.update({ where: { id: CARD_ID }, data: { columnId: beforeCard.columnId, title: beforeCard.title } });
  console.log('\nCleanup: card restored to original column + title');

  console.log('\n=== Done ===');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
