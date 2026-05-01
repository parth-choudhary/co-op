import type { Plugin, PluginToolSpec } from '../contract';
import { executeAction, type AgentAction } from '../../agentActions';
import { getToolDefinitions } from '../../agentTools';

// The kanban plugin wraps the existing monolithic executeAction() switch.
// Each tool's handler rewrites the tool-call args into the AgentAction shape
// and delegates. This is the seam that lets the harness iterate plugins
// without rewriting action handlers.

const KANBAN_TOOL_NAMES = new Set<string>([
  'create_card',
  'list_subtasks',
  'update_card',
  'move_card',
  'add_comment',
  'list_comments',
  'assign_card',
  'unassign_card',
  'add_member',
  'remove_member',
  'create_checklist',
  'toggle_checklist_item',
  'list_boards',
  'list_columns',
  'list_cards',
  'get_card',
]);

function makeTool(def: { name: string; description: string; parameters: any }): PluginToolSpec {
  return {
    name: def.name,
    description: def.description,
    parameters: def.parameters,
    requires: 'kanban',
    handler: async (ctx, args) => {
      const action = { type: def.name, ...args } as AgentAction;
      return executeAction(ctx.agentId, action);
    },
  };
}

export const kanbanPlugin: Plugin = {
  name: 'kanban',
  description: 'Kanban board tools — cards, columns, members, checklists.',
  tools: getToolDefinitions()
    .filter((d) => KANBAN_TOOL_NAMES.has(d.name))
    .map(makeTool),
};
