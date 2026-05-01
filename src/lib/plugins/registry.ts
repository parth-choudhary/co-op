import type { Plugin, PluginToolSpec } from './contract';
import { kanbanPlugin } from './builtin/kanban';
import { codingPlugin } from './builtin/coding';
import { shellPlugin } from './builtin/shell';
import { skillsPlugin } from './builtin/skills';
import { subagentPlugin } from './builtin/subagent';
import { aboutPlugin } from './builtin/about';
import { schedulerPlugin } from './builtin/scheduler';

const BUILTIN: Plugin[] = [
  kanbanPlugin,
  aboutPlugin,
  codingPlugin,
  shellPlugin,
  skillsPlugin,
  subagentPlugin,
  schedulerPlugin,
];

const byName = new Map<string, Plugin>();
for (const p of BUILTIN) byName.set(p.name, p);

export function listPlugins(): Plugin[] {
  return [...byName.values()];
}

export function getPlugin(name: string): Plugin | undefined {
  return byName.get(name);
}

// Resolve the effective tool list for an agent, given its enabled plugin names.
// When `enabledPlugins` is empty we default to the always-on plugins (kanban/about)
// for backwards compatibility with existing agents.
export function resolveToolsForAgent(enabledPlugins: string[]): PluginToolSpec[] {
  const effective = enabledPlugins.length > 0
    ? enabledPlugins
    : ['kanban', 'about', 'coding', 'scheduler']; // legacy default
  const tools: PluginToolSpec[] = [];
  for (const name of effective) {
    const p = byName.get(name);
    if (!p?.tools) continue;
    tools.push(...p.tools);
  }
  return tools;
}

export function findToolByName(name: string): PluginToolSpec | undefined {
  for (const p of byName.values()) {
    const t = p.tools?.find((x) => x.name === name);
    if (t) return t;
  }
  return undefined;
}
