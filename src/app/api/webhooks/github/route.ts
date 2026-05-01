import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/coding/githubApp';
import {
  handlePullRequestEvent,
  handleCheckSuiteEvent,
  handleWorkflowRunEvent,
} from '@/lib/coding/webhookHandler';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    switch (event) {
      case 'pull_request':
        await handlePullRequestEvent(payload); break;
      case 'check_suite':
        await handleCheckSuiteEvent(payload); break;
      case 'workflow_run':
        await handleWorkflowRunEvent(payload); break;
      case 'ping':
        // App installation healthcheck
        break;
      default:
        // Ignore unrelated events silently; GitHub expects 2xx.
        break;
    }
  } catch (err: any) {
    console.error(`[github webhook:${event}]`, err);
    // Don't 500 — GitHub will retry and we don't want storms. Log and ack.
  }

  return NextResponse.json({ ok: true });
}
