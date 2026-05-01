// The AgentRuntime contract is the single, stable seam between "what an agent
// is" (our Prisma row + plugins + skills) and "who executes it" (native SDK
// loop, vendored OpenClaw, external gateway, …).
//
// RULES:
//   - This file is versioned. Breaking changes require a contract bump and a
//     corresponding bump of every implementing runtime.
//   - Runtimes never reach into Prisma. They receive an already-resolved
//     AgentSpec and a RuntimeContext. Host-level concerns (secrets, logging,
//     plugin dispatch) are passed in via ports.
//   - An agent's "identity" is its AgentSpec: prompt, model, tools, skills.
//     Both native and openclaw-vendored runtimes execute the same spec.

import type { PluginToolSpec, RunFrame } from '../plugins/contract';

export interface AgentSpec {
  id: string;
  projectId: string | null;
  name: string;
  role: string;
  roleLabel: string;
  description: string | null;
  systemPrompt: string;
  modelProvider: string;   // 'anthropic' | 'openai' | future
  modelName: string;
  temperature: number;
  plugins: string[];
  skills: string[];
  perpetual: boolean;
  scheduleCron: string | null;
}

export interface RunSpec {
  agent: AgentSpec;
  userPrompt: string;
  extraContext?: string;
  maxTokens?: number;
  maxToolRounds?: number;
  enableTools?: boolean;
  runId?: string;
  harnessKind?: 'card' | 'chat' | 'dm' | 'webhook' | 'cron' | 'manual';
  cardId?: string | null;
}

export interface RuntimePorts {
  /** Resolve the API key for a model provider. */
  getApiKey: (projectId: string | null, provider: string) => Promise<string | null>;
  /** Return the compiled system prompt (harness). */
  compileSystemPrompt: (agentId: string, kind?: RunSpec['harnessKind'], cardId?: string | null) => Promise<string>;
  /** Tool schemas the agent is allowed to use this run. */
  resolveTools: (agent: AgentSpec) => PluginToolSpec[];
  /** Execute one tool call. */
  dispatchTool: (
    toolName: string,
    input: Record<string, unknown>,
    ctx: { agentId: string; projectId: string | null; runId?: string; frame: RunFrame },
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  /** Structured logging — each runtime should emit these; the host decides where they land. */
  log: (event: RuntimeLogEvent) => void | Promise<void>;
}

export type RuntimeLogEvent =
  | { kind: 'tool_call'; toolName: string; input: unknown; result: unknown; runId?: string }
  | { kind: 'round'; round: number; inputTokens?: number; outputTokens?: number; runId?: string }
  | { kind: 'finished'; reason: string; runId?: string }
  | { kind: 'error'; message: string; runId?: string };

export interface RunResult {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolResults?: Array<{ tool: string; input: unknown; result: unknown }>;
  runtime: string;
}

export interface AgentRuntime {
  readonly name: string;
  readonly version: string;
  capabilities(): {
    streaming: boolean;
    tools: boolean;
    providers: string[];
  };
  invoke(spec: RunSpec, ports: RuntimePorts): Promise<RunResult>;
}

// Runtime selection — driven by the agent row's `runtime` column (future) or
// a global env default. Today only `native` ships; `openclaw` lands after the
// vendor step.
export type RuntimeName = 'native' | 'openclaw';
