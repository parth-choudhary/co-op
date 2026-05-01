import prisma from '../db';
import { tryDecrypt } from '../crypto';

// Load project secrets suitable for injection into a sandbox exec.
// Only secrets with mountAs='env' are returned as environment variables; file-mount
// secrets are materialized separately by the sandbox provisioner.
export async function loadProjectSecretsAsEnv(projectId: string): Promise<Record<string, string>> {
  const rows = await prisma.projectSecret.findMany({
    where: { projectId, mountAs: 'env' },
    select: { key: true, valueEncrypted: true },
  });
  const out: Record<string, string> = {};
  for (const r of rows) {
    const v = tryDecrypt(r.valueEncrypted);
    if (v != null) out[r.key] = v;
  }
  return out;
}

export async function loadProjectSecretsAsFiles(projectId: string): Promise<Array<{ path: string; content: string }>> {
  const rows = await prisma.projectSecret.findMany({
    where: { projectId, mountAs: 'file' },
    select: { mountPath: true, valueEncrypted: true },
  });
  const out: Array<{ path: string; content: string }> = [];
  for (const r of rows) {
    if (!r.mountPath) continue;
    const v = tryDecrypt(r.valueEncrypted);
    if (v != null) out.push({ path: r.mountPath, content: v });
  }
  return out;
}
