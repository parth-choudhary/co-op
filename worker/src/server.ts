import express from 'express';
import { verifySignature } from './hmac.js';
import { runJob, type Job } from './jobRunner.js';

const PORT = Number(process.env.PORT || 8787);

const app = express();
// We need the raw body for HMAC, so disable the json body parser and read manually.
app.use(express.text({ type: '*/*', limit: '256kb' }));

app.get('/health', (_req, res) => { res.json({ ok: true, version: 1 }); });

app.post('/jobs', async (req, res) => {
  const raw = typeof req.body === 'string' ? req.body : '';
  if (!verifySignature(raw, req.header('x-coop-signature'))) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }
  let job: Job;
  try { job = JSON.parse(raw); } catch { res.status(400).json({ error: 'Invalid JSON' }); return; }
  if (!job.runId || !job.repoFullName || !job.branchName || !job.briefUrl || !job.callbackUrl) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Fire-and-forget. The job posts status back via callbackUrl.
  res.status(202).json({ accepted: true, runId: job.runId });
  setImmediate(() => {
    runJob(job).catch((err) => console.error(`[worker] job ${job.runId} crashed:`, err));
  });
});

app.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});
