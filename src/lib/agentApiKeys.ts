// Centralized API-key lookup for agent runs and ancillary jobs (summarization,
// embeddings, etc.). Project-scoped ModelKey rows take precedence; env-var
// fallback applies when no project key is present.

import prisma from './db';
import { tryDecrypt } from './crypto';

export function isCliProvider(provider: string): boolean {
  return provider === 'claude-cli' || provider === 'codex-cli';
}

export async function getApiKey(projectId: string | null, provider: string): Promise<string | null> {
  // CLI runtimes shell out to a local binary (claude / codex) — no API key needed.
  if (isCliProvider(provider)) return 'cli';

  if (projectId) {
    const key = await prisma.modelKey.findFirst({
      where: { projectId, provider, isValid: true },
      orderBy: { createdAt: 'desc' },
    });
    if (key?.keyEncrypted) {
      const decrypted = tryDecrypt(key.keyEncrypted);
      if (decrypted) return decrypted;
    }
  }
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || null;
  if (provider === 'openai') return process.env.OPENAI_API_KEY || null;
  return null;
}
