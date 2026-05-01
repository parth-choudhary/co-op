import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const attachments = await prisma.attachment.findMany({
    where: { cardId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(attachments);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { name, url, mimeType, size } = await request.json();
  if (!name || !url) return NextResponse.json({ error: 'name and url required' }, { status: 400 });

  const attachment = await prisma.attachment.create({
    data: { cardId: id, name, url, mimeType: mimeType || null, size: size || null, uploadedById: user.id },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: id, type: 'attachment_added',
      content: `attached ${name}`,
      actorId: user.id, actorType: 'user',
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { attachmentId } = await request.json();
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.attachment.delete({ where: { id: attachmentId } });

  await prisma.cardActivity.create({
    data: {
      cardId: id, type: 'attachment_removed',
      content: `removed ${attachment.name}`,
      actorId: user.id, actorType: 'user',
    },
  });

  return NextResponse.json({ message: 'Deleted' });
}
