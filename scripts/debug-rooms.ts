import 'dotenv/config';
import prisma from '../src/lib/db';

async function main() {
  const projectId = 'cmnyrycp40000kag6ki3yckd2';
  try {
    const channels = await prisma.chatChannel.findMany({
      where: { projectId, kind: 'channel' },
      select: { id: true, name: true, matrixRoomId: true, kind: true },
    });
    console.log('channels:', channels);
  } catch (e: any) { console.error('channels failed:', e.message); }

  try {
    const dms = await prisma.chatChannel.findMany({
      where: { projectId, kind: 'dm', members: { some: { userId: 'cmnyc3xxn000gw4g6l9ibd06n' } } },
      include: { members: { include: { user: true, agent: true } } },
    });
    console.log('dms:', dms);
  } catch (e: any) { console.error('dms failed:', e.message); }
  await prisma.$disconnect();
}
main();
