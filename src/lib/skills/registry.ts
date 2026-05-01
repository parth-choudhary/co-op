import prisma from '../db';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSkillMd } from './loader';

// Bundled skills live in /skills at the repo root. Each skill is a folder
// with a SKILL.md file; bundles are installable to any project via the
// registry API.
const BUNDLED_SKILLS_DIR = join(process.cwd(), 'skills');

export interface BundledSkill {
  slug: string;
  version: string;
  manifest: any;
  body: string;
  dir: string;
}

export function listBundledSkills(): BundledSkill[] {
  if (!existsSync(BUNDLED_SKILLS_DIR)) return [];
  const entries = readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true });
  const out: BundledSkill[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(BUNDLED_SKILLS_DIR, e.name);
    const candidate = ['SKILL.md', 'skill.md']
      .map((f) => join(dir, f))
      .find((f) => existsSync(f));
    if (!candidate) continue;
    const raw = readFileSync(candidate, 'utf8');
    const parsed = parseSkillMd(raw, e.name);
    out.push({ ...parsed, dir });
  }
  return out;
}

export async function installBundledSkill(projectId: string, slug: string) {
  const skill = listBundledSkills().find((s) => s.slug === slug);
  if (!skill) throw new Error(`Bundled skill "${slug}" not found`);
  return prisma.installedSkill.upsert({
    where: { projectId_slug: { projectId, slug } },
    create: {
      projectId,
      slug,
      version: skill.version,
      source: 'bundled',
      manifestJson: skill.manifest as any,
      bodyMd: skill.body,
      enabled: true,
    },
    update: {
      version: skill.version,
      manifestJson: skill.manifest as any,
      bodyMd: skill.body,
      enabled: true,
    },
  });
}

export async function installSkillFromMarkdown(projectId: string, slug: string, raw: string, source = 'url', sourceRef?: string) {
  const parsed = parseSkillMd(raw, slug);
  return prisma.installedSkill.upsert({
    where: { projectId_slug: { projectId, slug: parsed.slug } },
    create: {
      projectId,
      slug: parsed.slug,
      version: parsed.version,
      source,
      sourceRef,
      manifestJson: parsed.manifest as any,
      bodyMd: parsed.body,
      enabled: true,
    },
    update: {
      version: parsed.version,
      source,
      sourceRef,
      manifestJson: parsed.manifest as any,
      bodyMd: parsed.body,
      enabled: true,
    },
  });
}
