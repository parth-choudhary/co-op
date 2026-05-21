/* eslint-disable @typescript-eslint/no-explicit-any -- `session.user as any`
   and `catch (err: any)` are the project-wide conventions for auth-gated API
   routes (see src/app/api/agents/route.ts, src/app/api/projects/route.ts). */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { seedDemoProject } from '@/lib/onboarding/seed';

// Brownfield path. Existing users (who registered before the demo seed was
// added) hit this from the "Create demo project" button on the project hub.
// New users go through the register-time seed and don't need this.
// Idempotent — re-clicks return the existing demo project id instead of
// creating duplicates.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!user.companyId) return NextResponse.json({ error: 'No company on session' }, { status: 400 });

  try {
    const seeded = await seedDemoProject({ userId: user.id, companyId: user.companyId });
    return NextResponse.json({ projectId: seeded.projectId, agentId: seeded.agentId, cardIds: seeded.cardIds }, { status: 201 });
  } catch (err: any) {
    console.error('[onboarding/demo] seed failed:', err);
    return NextResponse.json({ error: err?.message || 'Seed failed' }, { status: 500 });
  }
}
