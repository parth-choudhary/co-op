import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { seedDemoProject } from '@/lib/onboarding/seed';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, companyName } = await request.json();
    if (!email || !password || !name || !companyName) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx: any) => {
      const company = await tx.company.create({ data: { name: companyName } });
      const user = await tx.user.create({
        data: { email, name, passwordHash, role: 'owner', companyId: company.id },
      });
      return { user, company };
    });

    // Best-effort onboarding seed. A seed failure must never block account
    // creation — the user can still create projects by hand, and the dashboard
    // exposes a "Create demo project" button as a brownfield fallback.
    let demoProjectId: string | null = null;
    try {
      const seeded = await seedDemoProject({ userId: result.user.id, companyId: result.company.id });
      demoProjectId = seeded.projectId;
    } catch (seedErr) {
      console.warn('[register] demo seed failed (non-fatal):', seedErr);
    }

    return NextResponse.json({
      message: 'Account created successfully',
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      demoProjectId,
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
