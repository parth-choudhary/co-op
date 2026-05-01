import 'dotenv/config';
import prisma from '../src/lib/db';
import { handleChatMessage } from '../src/lib/agentRunner';

const PROJECT_ID = 'cmnyrycp40000kag6ki3yckd2';
const CHANNEL_ID = 'cmnytqzrp0002wmg6t1lhy94h';

async function main() {
  const channel = await prisma.chatChannel.findUnique({ where: { id: CHANNEL_ID } });
  if (!channel) throw new Error('channel missing');
  console.log('channel', { id: channel.id, name: channel.name, matrixRoomId: channel.matrixRoomId });

  const result = await handleChatMessage({
    projectId: PROJECT_ID,
    roomId: channel.id,
    matrixRoomId: channel.matrixRoomId,
    roomName: channel.name,
    sender: 'test',
    content: '@CMO Agent hey, what up?',
    postReplies: true,
  });
  console.log('result', JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
