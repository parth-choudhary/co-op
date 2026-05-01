import type { Plugin } from '../contract';
import prisma from '../../db';
import { loadSkillForProject, skillPromptAppendix, validateSkillRequires } from '../../skills/loader';

export const skillsPlugin: Plugin = {
  name: 'skills',
  description: 'Invoke installed ClawHub-format skills. Opens a scoped frame granting shell + skill context for the invocation window.',
  tools: [
    {
      name: 'use_skill',
      description:
        'Invoke an installed skill by slug. The skill\'s SKILL.md body and examples are injected into context for the next few turns, and shell access is granted. Call end_skill when finished.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          args: { type: 'object', description: 'Optional structured args forwarded to the skill invocation' },
        },
        required: ['slug'],
      },
      requires: 'skills',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'use_skill requires a project' };
        const slug = String(args.slug || '').trim();
        if (!slug) return { ok: false, error: 'slug required' };
        const skill = await loadSkillForProject(ctx.projectId, slug);
        if (!skill) return { ok: false, error: `Skill "${slug}" not installed on this project` };
        const validation = await validateSkillRequires(ctx.projectId, skill);
        if (!validation.ok) return { ok: false, error: validation.error };

        const run = await prisma.skillRun.create({
          data: {
            agentTaskRunId: ctx.runId || 'adhoc',
            slug,
            args: (args.args ?? null) as any,
            status: 'running',
          },
        }).catch(() => null); // run table requires real runId; tolerate adhoc

        if (ctx.frame) {
          ctx.frame.skillSlug = slug;
          ctx.frame.promptAppendix = skillPromptAppendix(skill);
          ctx.frame.grantedCapabilities = [...(ctx.frame.grantedCapabilities || []), 'shell', 'exec_shell'];
        }

        return {
          ok: true,
          data: {
            slug,
            skillRunId: run?.id,
            message: `Skill "${slug}" loaded. Shell access is granted for this frame. Use exec_shell; call end_skill when done.`,
            guidance: skillPromptAppendix(skill).slice(0, 4000),
          },
        };
      },
    },
    {
      name: 'end_skill',
      description: 'Close the currently active skill frame. Revokes shell access granted by the skill and removes the skill guidance from subsequent turns.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Optional summary of what the skill accomplished' },
        },
      },
      requires: 'skills',
      handler: async (ctx, args) => {
        if (!ctx.frame?.skillSlug) return { ok: false, error: 'No active skill frame' };
        const slug = ctx.frame.skillSlug;
        ctx.frame.skillSlug = undefined;
        ctx.frame.promptAppendix = undefined;
        ctx.frame.grantedCapabilities = (ctx.frame.grantedCapabilities || []).filter(
          (c) => c !== 'shell' && c !== 'exec_shell',
        );
        await prisma.skillRun.updateMany({
          where: { agentTaskRunId: ctx.runId || 'adhoc', slug, status: 'running' },
          data: { status: 'completed', endedAt: new Date(), resultSummary: String(args.summary || '') },
        });
        return { ok: true, data: { slug, summary: args.summary || null } };
      },
    },
    {
      name: 'list_skills',
      description: 'List skills installed on the current project.',
      parameters: { type: 'object', properties: {} },
      requires: 'skills',
      handler: async (ctx) => {
        if (!ctx.projectId) return { ok: false, error: 'project required' };
        const rows = await prisma.installedSkill.findMany({
          where: { projectId: ctx.projectId, enabled: true },
          select: { slug: true, version: true, manifestJson: true },
          orderBy: { slug: 'asc' },
        });
        return {
          ok: true,
          data: rows.map((r: any) => ({
            slug: r.slug,
            version: r.version,
            description: (r.manifestJson as any)?.description || '',
          })),
        };
      },
    },
  ],
};
