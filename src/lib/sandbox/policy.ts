import prisma from '../db';
import type { SkillManifest } from '../skills/loader';

// Build a policy document modeled on OpenClaw / OpenShell's egress shape:
// { destination, port, binary } triples forming an allowlist.
// Filesystem and process sections are locked at sandbox creation;
// the network section is regenerated whenever skills are installed / removed.

export interface PolicyDoc {
  filesystem: { readWrite: string[]; readOnly: string[] };
  process: { allowBins: string[] };
  network: { egress: Array<{ host: string; port: number; binary?: string }> };
}

const BASE_ALLOW_BINS = ['sh', 'bash', 'curl', 'jq', 'git', 'gh', 'node', 'python3', 'uv', 'yq', 'rg', 'sed', 'awk', 'head', 'tail'];

function destinationsFromSkill(manifest: SkillManifest): Array<{ host: string; port: number; binary?: string }> {
  const out: Array<{ host: string; port: number; binary?: string }> = [];
  // Conservative heuristic: if a skill requires GITHUB_TOKEN, allow api.github.com
  const env = manifest.metadata?.openclaw?.requires?.env || [];
  if (env.includes('GITHUB_TOKEN')) out.push({ host: 'api.github.com', port: 443, binary: 'curl' });
  if (env.includes('REDDIT_CLIENT_ID') || env.includes('REDDIT_TOKEN')) out.push({ host: 'oauth.reddit.com', port: 443, binary: 'curl' });
  if (env.includes('DISCORD_BOT_TOKEN')) out.push({ host: 'discord.com', port: 443, binary: 'curl' });
  if (env.includes('X_BEARER_TOKEN') || env.includes('TWITTER_BEARER_TOKEN')) out.push({ host: 'api.twitter.com', port: 443, binary: 'curl' });
  return out;
}

export async function buildProjectPolicy(projectId: string): Promise<PolicyDoc> {
  const [cfg, skills] = await Promise.all([
    prisma.projectSandboxConfig.findUnique({ where: { projectId } }),
    prisma.installedSkill.findMany({ where: { projectId, enabled: true }, select: { manifestJson: true } }),
  ]);
  const egress: PolicyDoc['network']['egress'] = [];
  for (const row of skills) {
    for (const dest of destinationsFromSkill(row.manifestJson as SkillManifest)) egress.push(dest);
  }
  return {
    filesystem: {
      readWrite: [cfg?.workspaceDir || '/workspace'],
      readOnly: ['/skills'],
    },
    process: { allowBins: BASE_ALLOW_BINS },
    network: { egress },
  };
}

export function policyToYaml(doc: PolicyDoc): string {
  // Tiny YAML serializer — avoids a dep. The sandbox operator consumes this.
  const lines: string[] = [];
  lines.push('filesystem:');
  lines.push('  readWrite:');
  for (const p of doc.filesystem.readWrite) lines.push(`    - ${JSON.stringify(p)}`);
  lines.push('  readOnly:');
  for (const p of doc.filesystem.readOnly) lines.push(`    - ${JSON.stringify(p)}`);
  lines.push('process:');
  lines.push('  allowBins:');
  for (const b of doc.process.allowBins) lines.push(`    - ${b}`);
  lines.push('network:');
  lines.push('  egress:');
  for (const e of doc.network.egress) {
    lines.push(`    - host: ${JSON.stringify(e.host)}`);
    lines.push(`      port: ${e.port}`);
    if (e.binary) lines.push(`      binary: ${e.binary}`);
  }
  return lines.join('\n') + '\n';
}

export async function refreshProjectPolicyYaml(projectId: string): Promise<string> {
  const doc = await buildProjectPolicy(projectId);
  const yaml = policyToYaml(doc);
  await prisma.projectSandboxConfig.update({ where: { projectId }, data: { policyYaml: yaml } }).catch(async () => {
    await prisma.projectSandboxConfig.create({ data: { projectId, policyYaml: yaml } });
  });
  return yaml;
}
