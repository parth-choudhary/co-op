// Minimal 5-field cron next-tick calculator. Supports:
//   *, number, a-b, a,b,c, */N (in any field)
// Fields: minute hour dayOfMonth month dayOfWeek (0=Sun..6=Sat)
// Enough for "every 15m", "0 9 * * 1", "*/5 * * * *", etc. — no seconds, no L/W/#.

function parseField(f: string, min: number, max: number): Set<number> {
  if (f === '*') {
    const s = new Set<number>();
    for (let i = min; i <= max; i++) s.add(i);
    return s;
  }
  const out = new Set<number>();
  for (const piece of f.split(',')) {
    const step = piece.match(/^(\*|[0-9]+(?:-[0-9]+)?)\/(\d+)$/);
    if (step) {
      const range = step[1];
      const stepN = parseInt(step[2], 10);
      let lo = min, hi = max;
      if (range !== '*') {
        const [a, b] = range.split('-').map((x) => parseInt(x, 10));
        lo = a; hi = isNaN(b) ? max : b;
      }
      for (let i = lo; i <= hi; i += stepN) out.add(i);
      continue;
    }
    const range = piece.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let i = a; i <= b; i++) out.add(i);
      continue;
    }
    const n = parseInt(piece, 10);
    if (!isNaN(n)) out.add(n);
  }
  return out;
}

export function validateCron(expr: string): { ok: true } | { ok: false; error: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { ok: false, error: 'Cron must have 5 fields: minute hour dayOfMonth month dayOfWeek' };
  try {
    parseField(parts[0], 0, 59);
    parseField(parts[1], 0, 23);
    parseField(parts[2], 1, 31);
    parseField(parts[3], 1, 12);
    parseField(parts[4], 0, 6);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'parse error' };
  }
}

// Next matching time strictly greater than `from` (UTC).
export function nextCronMatch(expr: string, from: Date): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('invalid cron');
  const minutes = parseField(parts[0], 0, 59);
  const hours = parseField(parts[1], 0, 23);
  const doms = parseField(parts[2], 1, 31);
  const months = parseField(parts[3], 1, 12);
  const dows = parseField(parts[4], 0, 6);

  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  // Bounded search — scan ahead up to 400 days.
  for (let guard = 0; guard < 400 * 24 * 60; guard++) {
    const mo = d.getUTCMonth() + 1;
    if (!months.has(mo)) {
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    const dom = d.getUTCDate();
    const dow = d.getUTCDay();
    // Classical cron: day fields OR'd unless both are *
    const domStar = parts[2] === '*';
    const dowStar = parts[4] === '*';
    const dayOk = domStar && dowStar
      ? true
      : domStar ? dows.has(dow)
      : dowStar ? doms.has(dom)
      : doms.has(dom) || dows.has(dow);
    if (!dayOk) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!hours.has(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes.has(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return new Date(d.getTime());
  }
  throw new Error('no cron match within 400 days');
}

// Parse "when" directives from the schedule_task tool.
//   "cron:0 9 * * 1"   → recurring
//   "at:2026-03-14T09:00:00Z" → one-shot absolute
//   "in:2m" / "in:3h" / "in:1d" / "in:90s" → one-shot relative
export function parseWhen(when: string, now = new Date()): { kind: 'recurring' | 'one_shot'; cronExpr?: string; runAt?: Date } {
  const trimmed = when.trim();
  if (trimmed.startsWith('cron:')) {
    const expr = trimmed.slice(5).trim();
    const v = validateCron(expr);
    if (!v.ok) throw new Error(`invalid cron: ${v.error}`);
    return { kind: 'recurring', cronExpr: expr };
  }
  if (trimmed.startsWith('at:')) {
    const iso = trimmed.slice(3).trim();
    const d = new Date(iso);
    if (isNaN(d.getTime())) throw new Error('invalid ISO timestamp after at:');
    return { kind: 'one_shot', runAt: d };
  }
  if (trimmed.startsWith('in:')) {
    const dur = trimmed.slice(3).trim();
    const m = dur.match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!m) throw new Error('invalid duration after in: (use NNs / NNm / NNh / NNd)');
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's'|'m'|'h'|'d']!;
    return { kind: 'one_shot', runAt: new Date(now.getTime() + n * ms) };
  }
  throw new Error('when must start with cron: / at: / in:');
}
