import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { langfuseProjectUrl } from '@/lib/observability/langfuse';

// Returns the Langfuse deep-link prefix for the current deployment, or
// { enabled: false } when the SDK is unconfigured. Read by the agent harness
// modal and any future run-detail UI so the client doesn't need the host /
// project id in its env. Auth-gated to keep the endpoint shape out of
// unauthenticated probes — the URL itself is not a secret, but we don't need
// to advertise the trace host publicly either.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectUrl = langfuseProjectUrl();
  if (!projectUrl) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, projectUrl });
}
