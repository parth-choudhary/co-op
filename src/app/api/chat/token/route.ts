import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { registerMatrixUser, loginMatrixUser, generateMatrixPassword } from '@/lib/matrix';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const localpart = `coop_${dbUser.id}`;
    const matrixPassword = generateMatrixPassword(dbUser.id);

    // Always try to ensure the Matrix user exists (idempotent via admin API PUT)
    try {
      await registerMatrixUser(localpart, dbUser.name, matrixPassword);
    } catch (regErr: any) {
      console.log('[Matrix] Registration result:', regErr.message);
      // User might already exist — that's fine, we'll login next
    }

    // Update DB if needed
    if (!dbUser.matrixUserId) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { matrixUserId: `@${localpart}:coop.local` },
      });
    }

    // Login to get access token
    const loginResult = await loginMatrixUser(localpart, matrixPassword);
    return NextResponse.json({
      accessToken: loginResult.access_token,
      userId: loginResult.user_id,
      homeserver: process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008',
      deviceId: loginResult.device_id,
    });
  } catch (e: any) {
    const msg = e.message || '';
    console.error('[Matrix Token Error]', msg);
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('connect')) {
      return NextResponse.json({ error: 'Matrix server not running. Start Synapse with docker-compose up.' }, { status: 503 });
    }
    return NextResponse.json({ error: msg || 'Failed to get Matrix token' }, { status: 500 });
  }
}
