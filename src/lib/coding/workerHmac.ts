import crypto from 'node:crypto';

function workerSecret(): string {
  const v = process.env.COOP_WORKER_SECRET;
  if (!v) throw new Error('COOP_WORKER_SECRET is not set');
  return v;
}

// Sign a body for transit between app ↔ worker. Format header:
//   X-Coop-Signature: t=<unix>,v1=<hex>
// where v1 = HMAC_SHA256(secret, `${t}.${rawBody}`).
export function signBody(rawBody: string): { header: string; timestamp: number } {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', workerSecret()).update(`${t}.${rawBody}`).digest('hex');
  return { header: `t=${t},v1=${sig}`, timestamp: t };
}

export function verifySignature(rawBody: string, header: string | null, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => {
    const [k, v] = p.split('=');
    return [k.trim(), v?.trim() || ''];
  }));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', workerSecret()).update(`${t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
