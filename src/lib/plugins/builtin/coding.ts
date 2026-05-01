import type { Plugin } from '../contract';
import { executeAction } from '../../agentActions';

export const codingPlugin: Plugin = {
  name: 'coding',
  description: 'Kick off the coding agent for a card.',
  tools: [
    {
      name: 'start_coding_task',
      description:
        'Start the coding agent for a card assigned to you. The project must have code automation configured. Returns a runId; the run continues asynchronously and opens a PR.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string' },
          notes: { type: 'string' },
          force: { type: 'boolean' },
        },
        required: ['cardId'],
      },
      requires: 'coding',
      handler: (ctx, args) =>
        executeAction(ctx.agentId, { type: 'start_coding_task', ...(args as any) }),
    },
  ],
};
