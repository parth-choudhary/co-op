import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import prisma from '@/lib/db';
import Sidebar from '@/components/layout/Sidebar';
import { BottomTabBar } from '@/components/mobile/BottomTabBar';
import OnboardingCoach from '@/components/onboarding/OnboardingCoach';
import { COACH_STEPS, DEMO_PROJECT_NAME } from '@/lib/onboarding/demoContent';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;
  const { projectId } = await params;

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) notFound();

  // Fetch the current project
  const currentProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, color: true, description: true },
  });
  if (!currentProject) notFound();

  // Fetch boards for this project
  const boards = await prisma.board.findMany({
    where: { projectId },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  // Fetch member count
  const memberCount = await prisma.projectMember.count({ where: { projectId } });

  // Fetch all projects for the switcher
  let allProjects: Array<{ id: string; name: string; color: string; icon: string }> = [];
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, name: true, color: true, icon: true } } },
      orderBy: { project: { updatedAt: 'desc' } },
    });
    allProjects = memberships.map((m: any) => m.project);
  } catch { /* DB might not be ready */ }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', paddingLeft: 'var(--sidebar-current-width, var(--sidebar-width))', transition: 'padding-left var(--transition-slow)' }}>
      <Sidebar
        user={{ id: user.id, name: user.name || 'User', email: user.email || '', companyName: user.companyName || 'Company', role: user.role || 'member' }}
        projects={allProjects}
        currentProject={currentProject}
        boards={boards}
        memberCount={memberCount}
      />
      <main style={{ flex: 1, minWidth: 0, minHeight: '100vh' }}>
        {children}
      </main>
      {/* M1 Phase 1 / Plan 01-04.5 — visible only at <768px (CSS-gated).
          Three tabs (Plans/Runs/Chat) scoped to the current project. */}
      <BottomTabBar />
      {/* Onboarding coach — gated client-side on this being the demo project +
          on localStorage not having recorded a dismissal. No-op for everyone else. */}
      {currentProject.name === DEMO_PROJECT_NAME && (
        <OnboardingCoach steps={COACH_STEPS} demoProjectId={projectId} currentProjectId={projectId} />
      )}
    </div>
  );
}
