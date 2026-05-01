import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;
// text-embedding-3-small accepts up to 8191 tokens (~32K chars) but our memory
// content is short by design — clip generously and skip tokenization overhead.
const MAX_INPUT_CHARS = 8000;

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

export function isEmbeddingEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Embed `text` using OpenAI text-embedding-3-small (1536 dims).
 *
 * Returns `null` when:
 *   - OPENAI_API_KEY is not set (keyless / CLI-only setups stay non-breaking)
 *   - input is empty after trimming
 *   - the OpenAI call fails or returns an unexpected shape
 *
 * Callers must treat null as "no embedding available" — write paths leave the
 * AgentMemory.embedding column NULL, and read paths fall back to the
 * non-vector load behavior.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  if (!input.trim()) return null;

  try {
    const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input });
    const vec = res.data[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIM) return null;
    return vec;
  } catch (err) {
    console.error('[embeddings] embedText failed:', err);
    return null;
  }
}

/**
 * pgvector accepts vectors as a string literal in the form `[0.1,0.2,...]`.
 * Prisma's `Unsupported("vector(1536)")` types must be bound through $queryRaw,
 * and binding a number[] directly produces a Postgres `array<float>` which is
 * NOT compatible with the `vector` type — we have to format it ourselves and
 * cast on the SQL side (`::vector`).
 */
export function toVectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIM;
