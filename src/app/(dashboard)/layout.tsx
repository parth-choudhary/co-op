import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import Sidebar from '@/components/layout/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  let projects: Array<{ id: string; name: string; color: string; icon: string }> = [];
  try {
    projects = await prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, color: true, icon: true },
      orderBy: { createdAt: 'desc' },
    });
  } catch { /* DB might not be ready */ }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar user={{ name: user.name || 'User', email: user.email || '', companyName: user.companyName || 'Company', role: user.role || 'member' }} projects={projects} />
      <main style={{ flex: 1, marginLeft: 'var(--sidebar-width)', minHeight: '100vh', transition: 'margin-left var(--transition-slow)' }}>
        {children}
      </main>
    </div>
  );
}
