import type { AgentRuntime, RuntimeName } from './contract';

const runtimes = new Map<string, AgentRuntime>();

export function registerRuntime(rt: AgentRuntime) {
  runtimes.set(rt.name, rt);
}

export function getRuntime(name: RuntimeName | string): AgentRuntime | undefined {
  return runtimes.get(name);
}

export function listRuntimes(): AgentRuntime[] {
  return [...runtimes.values()];
}
