// NativeRuntime — first concrete implementation of AgentRuntime.
// Today it delegates to the monolithic `runAgent` in `agentRunner.ts`, which
// is still the code path every call site uses. The purpose of wrapping it
// here is:
//   (1) make the AgentRuntime registry non-empty so future OpenClawRuntime has
//       a peer to compare against in compat tests;
//   (2) give us a single import site to swap runAgent for a proper
//       interface-conformant implementation later without touching callers.

import type { AgentRuntime, RunSpec, RunResult } from './contract';
import { runAgent } from '../agentRunner';
import { registerRuntime } from './registry';

export const nativeRuntime: AgentRuntime = {
  name: 'native',
  version: '1.0.0',
  capabilities() {
    return {
      streaming: false,
      tools: true,
      providers: ['anthropic', 'openai'],
    };
  },
  async invoke(spec: RunSpec): Promise<RunResult> {
    const r = await runAgent({
      agentId: spec.agent.id,
      userPrompt: spec.userPrompt,
      extraContext: spec.extraContext,
      maxTokens: spec.maxTokens,
      maxToolRounds: spec.maxToolRounds,
      enableTools: spec.enableTools,
      runId: spec.runId,
      harnessContext: { kind: spec.harnessKind, cardId: spec.cardId || undefined },
    });
    return { ...r, runtime: 'native' };
  },
};

registerRuntime(nativeRuntime);
