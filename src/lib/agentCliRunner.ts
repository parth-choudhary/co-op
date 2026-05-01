// CLI-driven agent runtime. Instead of calling the Anthropic / OpenAI HTTP APIs
// with a project API key, shell out to a locally-installed agent CLI (`claude`
// or `codex`) running in non-interactive mode. The CLI handles authentication
// with whatever account it's logged into; we just pipe the system prompt and
// user prompt in and capture stdout.
//
// Tool calls (kanban, comments, etc.) are NOT plumbed through these runs —
// the CLI has its own tool surface. We treat the CLI as a "text in / text
// out" reasoning engine. Callers that need tool execution should keep using
// the native runtime.

import { spawn } from 'node:child_process';
import os from 'node:os';

export interface CliRunResult {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolResults?: undefined;
}

interface CliRunOpts {
  provider: 'claude-cli' | 'codex-cli';
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
  /** Hard cap on wall time for the CLI process. */
  timeoutMs?: number;
  /** Working directory for the CLI. Defaults to the OS tmpdir. */
  cwd?: string;
}

function exec(cmd: string, args: string[], opts: { cwd: string; input: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 1 }); });
    child.stdin.end(opts.input);
  });
}

export async function runAgentViaCli(opts: CliRunOpts): Promise<CliRunResult> {
  const cwd = opts.cwd || os.tmpdir();
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  if (opts.provider === 'claude-cli') {
    // Headless Claude Code: print one response and exit. Pipe userPrompt on
    // stdin so multi-line prompts and quotes don't have to be escaped.
    const args = [
      '--print',
      '--append-system-prompt', opts.systemPrompt,
      '--dangerously-skip-permissions',
    ];
    const r = await exec('claude', args, { cwd, input: opts.userPrompt, timeoutMs });
    if (r.code !== 0) {
      throw new Error(`claude CLI exited ${r.code}: ${r.stderr.trim().slice(-400) || 'no stderr'}`);
    }
    return {
      text: r.stdout.trim(),
      provider: 'claude-cli',
      model: opts.modelName || 'claude-code',
    };
  }

  if (opts.provider === 'codex-cli') {
    // Codex CLI non-interactive mode. The system prompt is folded into the
    // request prompt — codex's exec mode doesn't take a separate system flag.
    const composed = `# System\n${opts.systemPrompt}\n\n# Request\n${opts.userPrompt}`;
    const args = ['exec', '--skip-git-repo-check', '-'];
    const r = await exec('codex', args, { cwd, input: composed, timeoutMs });
    if (r.code !== 0) {
      throw new Error(`codex CLI exited ${r.code}: ${r.stderr.trim().slice(-400) || 'no stderr'}`);
    }
    return {
      text: r.stdout.trim(),
      provider: 'codex-cli',
      model: opts.modelName || 'codex',
    };
  }

  throw new Error(`Unsupported CLI provider: ${opts.provider as string}`);
}
