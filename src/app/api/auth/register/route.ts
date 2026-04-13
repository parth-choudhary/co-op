import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';

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
    return NextResponse.json({
      message: 'Account created successfully',
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
