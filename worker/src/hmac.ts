import crypto from 'node:crypto';

export function workerSecret(): string {
  const v = process.env.COOP_WORKER_SECRET;
  if (!v) throw new Error('COOP_WORKER_SECRET is not set');
  return v;
}

export function signBody(rawBody: string): string {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', workerSecret()).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

export function verifySignature(rawBody: string, header: string | undefined | null, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const p of header.split(',')) {
    const [k, v] = p.split('=');
    parts[k.trim()] = (v || '').trim();
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', workerSecret()).update(`${t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}
