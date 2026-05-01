import prisma from '../db';

// ClawHub / OpenClaw SKILL.md frontmatter shape. We accept the published
// fields but only enforce the ones we care about.
export interface SkillManifest {
  name?: string;
  description?: string;
  version?: string;
  primaryEnv?: string;
  homepage?: string;
  os?: string[];
  metadata?: {
    openclaw?: {
      requires?: {
        env?: string[];
        bins?: string[];
        anyBins?: string[];
        config?: string[];
      };
      primaryEnv?: string;
      always?: boolean;
      skillKey?: string;
      install?: Array<{ kind: string; package?: string; formula?: string; bin?: string[] }>;
    };
  };
}

export interface LoadedSkill {
  slug: string;
  version: string;
  manifest: SkillManifest;
  body: string;
}

const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

// Minimal YAML-subset parser for SKILL.md frontmatter.
// Supports: scalars, [a,b,c] inline lists, nested objects (indented),
// and block lists under a key (- item). That's the entire surface ClawHub
// frontmatter uses in practice. Lists of objects are not supported and will
// be stored as strings — we don't assert on them.
function parseFrontmatter(raw: string): Record<string, any> {
  const root: any = {};
  // Object-frames only. Each frame represents a container whose child keys
  // live at `indent` columns. Lists are stored in the parent's container
  // under pendingKey, so we never push a frame just to hold a list.
  const stack: Array<{ indent: number; container: any }> = [
    { indent: 0, container: root },
  ];
  let pendingKey: { name: string; indent: number; container: any } | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    if (trimmed.startsWith('- ')) {
      if (!pendingKey) continue;
      const { name, container } = pendingKey;
      if (!Array.isArray(container[name])) container[name] = [];
      container[name].push(stripQuotes(trimmed.slice(2).trim()));
      continue;
    }

    const m = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const key = m[1];
    const value = m[2];

    // Close any frames strictly deeper than this line.
    while (stack.length > 1 && stack[stack.length - 1].indent > indent) stack.pop();

    // If we have a pending key and this line is deeper, materialize pending as
    // an object container and push its frame.
    if (pendingKey && indent > pendingKey.indent) {
      if (!pendingKey.container[pendingKey.name] || Array.isArray(pendingKey.container[pendingKey.name])) {
        pendingKey.container[pendingKey.name] = {};
      }
      stack.push({ indent, container: pendingKey.container[pendingKey.name] });
      pendingKey = null;
    } else if (pendingKey && indent <= pendingKey.indent) {
      // Pending key had no children — leave as unset; drop it.
      pendingKey = null;
    }

    const container = stack[stack.length - 1].container;
    if (value === '') {
      pendingKey = { name: key, indent, container };
    } else if (value === '|' || value === '>') {
      container[key] = '';
    } else if (/^\[.*\]$/.test(value)) {
      container[key] = value.slice(1, -1).split(',').map((s) => stripQuotes(s.trim())).filter(Boolean);
    } else {
      container[key] = stripQuotes(value);
    }
  }
  return root;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  if (t === 'true') return true as any;
  if (t === 'false') return false as any;
  return t;
}

export function parseSkillMd(raw: string, fallbackSlug: string): LoadedSkill {
  const match = FM_RE.exec(raw);
  if (!match) {
    return {
      slug: fallbackSlug,
      version: '0.0.0',
      manifest: { name: fallbackSlug, description: '' },
      body: raw,
    };
  }
  const manifest = parseFrontmatter(match[1]) as SkillManifest;
  return {
    slug: manifest?.metadata?.openclaw?.skillKey || manifest.name || fallbackSlug,
    version: manifest.version || '0.0.0',
    manifest,
    body: match[2],
  };
}

export async function loadSkillForProject(projectId: string, slug: string): Promise<LoadedSkill | null> {
  const row = await prisma.installedSkill.findUnique({
    where: { projectId_slug: { projectId, slug } },
  });
  if (!row || !row.enabled) return null;
  return {
    slug: row.slug,
    version: row.version,
    manifest: row.manifestJson as SkillManifest,
    body: row.bodyMd,
  };
}

export function skillPromptAppendix(skill: LoadedSkill): string {
  const parts: string[] = [];
  parts.push(`## Skill: ${skill.slug} (v${skill.version})`);
  if (skill.manifest.description) parts.push(skill.manifest.description);
  parts.push('\nThe skill body below is active for this invocation. Follow its instructions; use `exec_shell` for any CLI it directs you to run. Call `end_skill` when done.\n');
  parts.push('---');
  parts.push(skill.body.trim());
  return parts.join('\n');
}

export async function validateSkillRequires(
  projectId: string,
  skill: LoadedSkill,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const req = skill.manifest.metadata?.openclaw?.requires;
  if (!req) return { ok: true };
  if (req.env && req.env.length > 0) {
    const rows = await prisma.projectSecret.findMany({
      where: { projectId, key: { in: req.env } },
      select: { key: true },
    });
    const have = new Set(rows.map((r: any) => r.key));
    const missing = req.env.filter((k) => !have.has(k));
    if (missing.length > 0) {
      return { ok: false, error: `Missing required project secrets: ${missing.join(', ')}. Add them in Settings → Secrets.` };
    }
  }
  const primary = skill.manifest.metadata?.openclaw?.primaryEnv || skill.manifest.primaryEnv;
  if (primary) {
    const row = await prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key: primary } } });
    if (!row) return { ok: false, error: `Missing primaryEnv secret "${primary}"` };
  }
  return { ok: true };
}
