// Next.js instrumentation hook. Runs once per server instance at boot.
// Drives the scheduler tick in-process so that `npm run dev` and `npm start`
// on a long-running Node host both Just Work with no external cron.
//
// Policy:
//   - Enabled by default on the Node runtime.
//   - Auto-disabled on known serverless platforms (where setInterval would be
//     killed with the invocation and/or duplicated per request). Those rely
//     on platform cron hitting /api/cron/agents/tick (see vercel.json).
//   - Explicit overrides: COOP_INPROC_CRON=1 forces on, =0 forces off.

function isServerlessHost(): boolean {
  return (
    process.env.VERCEL === '1' ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT ||
    process.env.NETLIFY === 'true' ||
    !!process.env.CF_PAGES ||
    process.env.FUNCTIONS_WORKER_RUNTIME != null // Azure Functions
  );
}

export async function register() {
  // Node runtime only — the edge runtime can't host a persistent loop.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const override = process.env.COOP_INPROC_CRON;
  if (override === '0') return;               // explicit off
  const forced = override === '1';
  if (!forced && isServerlessHost()) return;  // auto-off on serverless

  // Guard against double-registration across HMR / concurrent worker boots.
  const g = globalThis as any;
  if (g.__coopTickInterval) return;

  const intervalSec = Number(process.env.COOP_INPROC_CRON_INTERVAL_SEC || '30');
  // Dynamic import so this file isn't bundled into the edge runtime by accident.
  const { runTick } = await import('./lib/scheduler/tick');

  console.log(`[coop] in-process scheduler tick enabled (every ${intervalSec}s). Disable with COOP_INPROC_CRON=0.`);

  // Fire immediately on boot, then on interval. Swallow errors so one bad
  // tick doesn't kill the loop.
  const once = async () => {
    try {
      const r = await runTick();
      if (r.launched.length || r.scheduledFired.length) {
        console.log(`[coop] tick → launched=${r.launched.length} scheduledFired=${r.scheduledFired.length}`);
      }
    } catch (e: any) {
      console.error('[coop] tick error:', e?.message || e);
    }
  };
  // Delay first fire by a second so the server is fully up.
  setTimeout(once, 1000);
  g.__coopTickInterval = setInterval(once, intervalSec * 1000);
}
