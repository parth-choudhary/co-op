import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import Sidebar from '@/components/layout/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  // Fetch all projects the user is a member of (for the switcher)
  let projects: Array<{ id: string; name: string; color: string; icon: string }> = [];
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, name: true, color: true, icon: true } } },
      orderBy: { project: { updatedAt: 'desc' } },
    });
    projects = memberships.map((m: any) => m.project);
  } catch { /* DB might not be ready */ }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', paddingLeft: 'var(--sidebar-current-width, var(--sidebar-width))', transition: 'padding-left var(--transition-slow)' }}>
      <Sidebar
        user={{ id: user.id, name: user.name || 'User', email: user.email || '', companyName: user.companyName || 'Company', role: user.role || 'member' }}
        projects={projects}
      />
      <main style={{ flex: 1, minWidth: 0, minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
