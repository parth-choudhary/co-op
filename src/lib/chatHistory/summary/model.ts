// Cheap-model summarizer. Uses the same provider as the agent (so we reuse the
// same API key the agent already pays for) but downshifts to that provider's
// cheap tier:
//
//   anthropic → claude-haiku-4-5    (latest Haiku as of 2026-01)
//   openai    → gpt-4o-mini
//
// Both can be overridden via env (SUMMARY_MODEL_ANTHROPIC, SUMMARY_MODEL_OPENAI).
//
// The function takes a system prompt + a single user message (the prompt module
// builds these) and returns the model's text reply, capped at maxTokens.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getApiKey } from '../../agentApiKeys';

const DEFAULT_ANTHROPIC = process.env.SUMMARY_MODEL_ANTHROPIC || 'claude-haiku-4-5';
const DEFAULT_OPENAI = process.env.SUMMARY_MODEL_OPENAI || 'gpt-4o-mini';

export interface SummarizeArgs {
  provider: 'anthropic' | 'openai';
  projectId: string | null;
  system: string;
  user: string;
  maxTokens: number;
}

export interface SummarizeResult {
  text: string;
  modelUsed: string;
}

export async function runCheapSummary(args: SummarizeArgs): Promise<SummarizeResult | null> {
  const apiKey = await getApiKey(args.projectId, args.provider);
  if (!apiKey) {
    console.warn(`[summary/model] no API key for provider=${args.provider} project=${args.projectId}; skipping summarization`);
    return null;
  }

  if (args.provider === 'anthropic') {
    const model = DEFAULT_ANTHROPIC;
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
      temperature: 0.2,
    });
    const text = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
    return { text, modelUsed: model };
  }

  if (args.provider === 'openai') {
    const model = DEFAULT_OPENAI;
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model,
      max_tokens: args.maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
    });
    const text = (resp.choices[0]?.message.content || '').trim();
    return { text, modelUsed: model };
  }

  return null;
}
