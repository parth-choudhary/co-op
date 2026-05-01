import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { listBundledSkills, installBundledSkill, installSkillFromMarkdown } from '@/lib/skills/registry';
import { clawhubFetchSkillMd, clawhubGetSkill } from '@/lib/clawhub';

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [installed, bundled] = await Promise.all([
    prisma.installedSkill.findMany({
      where: { projectId },
      orderBy: { slug: 'asc' },
      select: { id: true, slug: true, version: true, source: true, enabled: true, manifestJson: true, updatedAt: true },
    }),
    Promise.resolve(listBundledSkills().map((s) => ({
      slug: s.slug,
      version: s.version,
      description: s.manifest?.description || '',
    }))),
  ]);
  return NextResponse.json({
    installed: installed.map((r: any) => ({
      ...r,
      description: (r.manifestJson as any)?.description || '',
      requires: (r.manifestJson as any)?.metadata?.openclaw?.requires || null,
    })),
    available: bundled,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  if (body.source === 'bundled' && body.slug) {
    const row = await installBundledSkill(projectId, body.slug);
    return NextResponse.json({ skill: { id: row.id, slug: row.slug, version: row.version } });
  }
  if (body.source === 'markdown' && body.slug && body.raw) {
    const row = await installSkillFromMarkdown(projectId, body.slug, body.raw, 'url', body.sourceRef);
    return NextResponse.json({ skill: { id: row.id, slug: row.slug, version: row.version } });
  }
  if (body.source === 'clawhub' && body.slug) {
    try {
      const [detail, raw] = await Promise.all([
        clawhubGetSkill(body.slug).catch(() => null),
        clawhubFetchSkillMd(body.slug),
      ]);
      const sourceRef = detail ? `clawhub:${detail.slug}@${detail.version}` : `clawhub:${body.slug}`;
      const row = await installSkillFromMarkdown(projectId, body.slug, raw, 'clawhub', sourceRef);
      return NextResponse.json({ skill: { id: row.id, slug: row.slug, version: row.version, source: 'clawhub' } });
    } catch (e: any) {
      return NextResponse.json({ error: `ClawHub install failed: ${e.message}` }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'Provide source=bundled|markdown|clawhub with slug (plus raw for markdown)' }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug query param required' }, { status: 400 });
  await prisma.installedSkill.deleteMany({ where: { projectId, slug } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  await prisma.installedSkill.updateMany({
    where: { projectId, slug: body.slug },
    data: { enabled: body.enabled === false ? false : true },
  });
  return NextResponse.json({ ok: true });
}
