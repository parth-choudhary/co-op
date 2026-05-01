import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

const kanbanTools: ToolDef[] = [
  {
    name: 'create_card',
    description: 'Create a new kanban card in a column. Pass parentCardId to create it as a subtask of an existing card — subtasks are first-class cards with their own assignee, status, and comments.',
    parameters: {
      type: 'object',
      properties: {
        columnId: { type: 'string', description: 'ID of the column to add the card to' },
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Card description (markdown supported)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Card priority level' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to tag the card with' },
        parentCardId: { type: 'string', description: 'Optional. ID of a parent card to nest this card under as a subtask.' },
      },
      required: ['columnId', 'title'],
    },
  },
  {
    name: 'list_subtasks',
    description: 'List all subtasks (child cards) of a card, with their column/status and assignee.',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'cuid or key like "COOP-123" of the parent card' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'update_card',
    description: 'Update fields on an existing card',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'cuid or key like "COOP-123" of the card to update' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        labels: { type: 'array', items: { type: 'string' } },
        dueDate: { type: ['string', 'null'], description: 'ISO date string or null to remove' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'move_card',
    description: 'Move a card to a different column or reorder within a column',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'cuid or key like "COOP-123" of the card to move' },
        columnId: { type: 'string', description: 'Target column ID' },
        position: { type: 'integer', description: 'Position in the target column (0-based). Omit to place at end.' },
      },
      required: ['cardId', 'columnId'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a card, or reply to an existing comment by passing parentCommentId',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'cuid or key like "COOP-123" of the card to comment on' },
        content: { type: 'string', description: 'Comment text (markdown supported)' },
        parentCommentId: { type: 'string', description: 'Optional. ID of the comment to reply to — must belong to the same card' },
      },
      required: ['cardId', 'content'],
    },
  },
  {
    name: 'list_comments',
    description: 'List recent comments on a card with thread parent IDs so you can reply',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        limit: { type: 'integer', description: 'Max comments to return (default 20, max 100)' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'assign_card',
    description: 'Set the primary assignee of a card to a user or agent',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        agentId: { type: 'string', description: 'Agent ID to assign (mutually exclusive with userId)' },
        userId: { type: 'string', description: 'User ID to assign (mutually exclusive with agentId)' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'unassign_card',
    description: 'Remove the primary assignee from a card',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'add_member',
    description: 'Add a user or agent as a member of a card',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        agentId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'remove_member',
    description: 'Remove a user or agent from card membership',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        agentId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'create_checklist',
    description: 'Create a checklist on a card, optionally with items',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        title: { type: 'string', description: 'Checklist title' },
        items: { type: 'array', items: { type: 'string' }, description: 'Initial checklist items' },
      },
      required: ['cardId', 'title'],
    },
  },
  {
    name: 'toggle_checklist_item',
    description: 'Check or uncheck a checklist item',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Checklist item ID' },
        isChecked: { type: 'boolean' },
      },
      required: ['itemId', 'isChecked'],
    },
  },
  {
    name: 'list_boards',
    description: 'List all boards in a project with their columns',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_columns',
    description: 'List all columns in a board with card counts',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'list_cards',
    description: 'List all cards in a column with summary info',
    parameters: {
      type: 'object',
      properties: {
        columnId: { type: 'string' },
      },
      required: ['columnId'],
    },
  },
  {
    name: 'get_card',
    description: 'Get full details of a card including checklists, members, and counts',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'start_coding_task',
    description: 'Kick off the coding agent for a card. Only use when the card is assigned to you and the project has code automation configured. Returns a runId; the run continues asynchronously and opens a PR against the repo.',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'cuid or key like "COOP-123" of the card describing the work' },
        notes: { type: 'string', description: 'Optional short note explaining why you are starting now' },
        force: { type: 'boolean', description: 'Proceed even if the card is not assigned to you. Use sparingly.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'propose_about_update',
    description: 'Propose a change to the project About section. The proposal is queued for human approval before anything is applied. Use this when your recent work implies the project scope, goals, or context has meaningfully shifted. The newText should be the ENTIRE replacement About content, not a diff.',
    parameters: {
      type: 'object',
      properties: {
        newText: { type: 'string', description: 'Full replacement content for the About section' },
        reason: { type: 'string', description: 'Short explanation of what changed and why, shown to the user when they review this proposal' },
      },
      required: ['newText', 'reason'],
    },
  },
  {
    name: 'set_project_memory',
    description: "Save a fact, decision, glossary entry, or convention to PROJECT memory — visible to every agent in this project on their next run. Use when you learn something the team should benefit from, NOT for your own private notes (those go in the agent memory tier you read at the top of every prompt). Re-using a key updates the existing entry. Examples: key='billing-deferred-to-v2' content='We decided to ship without billing in v1; revisit in Q3.' kind='decision'. key='auth-location' content='All auth code lives under src/lib/auth/.' kind='convention'.",
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short snake_case identifier. Re-using a key updates the existing entry — choose stable names.' },
        content: { type: 'string', description: 'The information to remember (markdown ok). Be concrete; future agents will read this verbatim.' },
        kind: {
          type: 'string',
          enum: ['decision', 'glossary', 'convention', 'fact'],
          description: "decision = something the team chose; glossary = a term definition; convention = a rule we follow; fact = an observation about the project. Defaults to 'fact'.",
        },
      },
      required: ['key', 'content'],
    },
  },
];

export function getAnthropicTools(): Anthropic.Tool[] {
  return kanbanTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool['input_schema'],
  }));
}

export function getOpenAITools(): OpenAI.ChatCompletionTool[] {
  return kanbanTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function getToolDefinitions(): ToolDef[] {
  return kanbanTools;
}
