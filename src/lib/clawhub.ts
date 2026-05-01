// ClawHub (https://clawhub.ai) public HTTP API client.
// Docs: https://github.com/openclaw/clawhub/blob/main/docs/http-api.md
//
// The registry is anonymous-readable; we proxy from the server to respect its
// per-IP rate limits and avoid exposing user IPs directly to the registry.
// If a tenant wants to authenticate (e.g. to install private skills), they can
// set CLAWHUB_TOKEN in env.

const BASE = process.env.CLAWHUB_API_BASE || 'https://clawhub.ai';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'co-op/1.0 (+clawhub-client)' };
  if (process.env.CLAWHUB_TOKEN) h.Authorization = `Bearer ${process.env.CLAWHUB_TOKEN}`;
  return h;
}

export interface ClawhubSearchResult {
  slug: string;
  displayName?: string;
  version: string;
  description?: string;
  updatedAt?: string;
  downloads?: number;
  stars?: number;
}

export async function clawhubSearch(q: string, limit = 20): Promise<ClawhubSearchResult[]> {
  const url = new URL('/api/v1/search', BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(Math.max(1, Math.min(50, limit))));
  const r = await fetch(url.toString(), { headers: headers(), cache: 'no-store' });
  if (!r.ok) throw new Error(`ClawHub search failed: ${r.status}`);
  const j: any = await r.json();
  // Be permissive about shape — the docs give fields but not a concrete schema.
  const items = Array.isArray(j) ? j : (j.results || j.items || j.skills || []);
  return items.map((it: any) => ({
    slug: String(it.slug || it.name),
    displayName: it.displayName || it.title,
    version: String(it.version || it.latestVersion || 'latest'),
    description: it.description,
    updatedAt: it.updatedAt,
    downloads: it.downloads,
    stars: it.stars,
  })).filter((x: any) => x.slug);
}

export async function clawhubBrowse(sort: 'updated' | 'downloads' | 'stars' | 'trending' = 'trending', limit = 30): Promise<ClawhubSearchResult[]> {
  const url = new URL('/api/v1/skills', BASE);
  url.searchParams.set('sort', sort);
  url.searchParams.set('limit', String(Math.max(1, Math.min(50, limit))));
  const r = await fetch(url.toString(), { headers: headers(), cache: 'no-store' });
  if (!r.ok) throw new Error(`ClawHub browse failed: ${r.status}`);
  const j: any = await r.json();
  const items = Array.isArray(j) ? j : (j.skills || j.items || []);
  return items.map((it: any) => ({
    slug: String(it.slug || it.name),
    displayName: it.displayName || it.title,
    version: String(it.version || it.latestVersion || 'latest'),
    description: it.description,
    updatedAt: it.updatedAt,
    downloads: it.downloads,
    stars: it.stars,
  })).filter((x: any) => x.slug);
}

export interface ClawhubSkillDetail {
  slug: string;
  displayName?: string;
  version: string;
  description?: string;
  homepage?: string;
  owner?: string;
  moderation?: any;
}

export async function clawhubGetSkill(slug: string): Promise<ClawhubSkillDetail> {
  const r = await fetch(new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, BASE).toString(), { headers: headers(), cache: 'no-store' });
  if (!r.ok) throw new Error(`ClawHub skill fetch failed: ${r.status}`);
  const j: any = await r.json();
  const it = j.skill || j;
  return {
    slug: String(it.slug || slug),
    displayName: it.displayName || it.title,
    version: String(it.version || it.latestVersion || 'latest'),
    description: it.description,
    homepage: it.homepage,
    owner: it.owner?.handle || it.ownerHandle,
    moderation: it.moderation,
  };
}

// Fetch SKILL.md raw content. The `file` endpoint has a 200KB limit on the server side.
export async function clawhubFetchSkillMd(slug: string): Promise<string> {
  const url = new URL(`/api/v1/skills/${encodeURIComponent(slug)}/file`, BASE);
  url.searchParams.set('path', 'SKILL.md');
  const r = await fetch(url.toString(), { headers: headers(), cache: 'no-store' });
  if (r.ok) return await r.text();
  // Try lowercase fallback some skills use.
  url.searchParams.set('path', 'skill.md');
  const r2 = await fetch(url.toString(), { headers: headers(), cache: 'no-store' });
  if (r2.ok) return await r2.text();
  throw new Error(`ClawHub SKILL.md not found for "${slug}" (${r.status}/${r2.status})`);
}
