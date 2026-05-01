import { readFileSync } from 'fs';
import { join } from 'path';

const VALID_ROLES = new Set(['cto', 'cmo', 'pm', 'developer', 'designer', 'custom']);

function readTemplateFile(filename: string): string {
  try {
    return readFileSync(join(process.cwd(), 'src/lib/agentTemplates', filename), 'utf8');
  } catch {
    return '';
  }
}

function normalizeRole(role: string): string {
  const normalized = role.toLowerCase();
  return VALID_ROLES.has(normalized) ? normalized : 'custom';
}

export function loadAgentTemplate(role: string): string {
  return readTemplateFile(`${normalizeRole(role)}.md`);
}

export function loadAgentSoul(role: string): string {
  return readTemplateFile(`${normalizeRole(role)}.soul.md`);
}

export function loadAgentTemplateBundle(role: string): { systemPrompt: string; soulMd: string } {
  return {
    systemPrompt: loadAgentTemplate(role),
    soulMd: loadAgentSoul(role),
  };
}

export function listAgentRoles(): string[] {
  return [...VALID_ROLES];
}
