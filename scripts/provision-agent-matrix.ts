import 'dotenv/config';
import prisma from '../src/lib/db';
import { registerMatrixUser, loginMatrixUser, generateMatrixPassword, matrixLocalpartFromAgentId, matrixUserIdFor } from '../src/lib/matrix';
import { encrypt } from '../src/lib/crypto';

async function main() {
  const agents = await prisma.aIAgent.findMany({ where: { matrixAccessToken: null, isActive: true } });
  console.log(`Provisioning ${agents.length} agent(s) without Matrix tokens`);
  for (const agent of agents) {
    const localpart = agent.matrixLocalpart || matrixLocalpartFromAgentId(agent.id);
    const password = generateMatrixPassword(agent.id);
    try {
      try { await registerMatrixUser(localpart, agent.name, password); } catch (e: any) { console.log(`[${agent.name}] register: ${e.message}`); }
      const login = await loginMatrixUser(localpart, password);
      const matrixUserId = login.user_id || matrixUserIdFor(localpart);
      await prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          matrixLocalpart: localpart,
          matrixUserId,
          matrixAccessToken: encrypt(login.access_token),
          matrixDeviceId: login.device_id || null,
        },
      });
      console.log(`[${agent.name}] provisioned as ${matrixUserId}`);
    } catch (err: any) {
      console.error(`[${agent.name}] FAILED: ${err.message}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
