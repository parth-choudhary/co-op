import type { Plugin } from '../contract';
import { executeAction } from '../../agentActions';

export const aboutPlugin: Plugin = {
  name: 'about',
  description: 'Propose updates to the project About section.',
  tools: [
    {
      name: 'propose_about_update',
      description:
        'Propose a change to the project About section. The proposal is queued for human approval before anything is applied. Use when recent work implies the project scope has shifted. newText must be the full replacement.',
      parameters: {
        type: 'object',
        properties: {
          newText: { type: 'string', description: 'Full replacement content' },
          reason: { type: 'string', description: 'Short explanation, shown in the review UI' },
        },
        required: ['newText', 'reason'],
      },
      requires: 'about',
      handler: (ctx, args) =>
        executeAction(ctx.agentId, { type: 'propose_about_update', ...(args as any) }),
    },
  ],
};
