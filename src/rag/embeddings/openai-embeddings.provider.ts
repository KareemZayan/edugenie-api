import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmbeddingsProvider, EmbeddingKind } from './embeddings.provider';

const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';
const DIMS = 768; // request 768 via the `dimensions` param to match the index
const BATCH = 256;

/**
 * OpenAI embeddings fallback (`text-embedding-3-small`). Only used when Gemini is
 * unconfigured (see RagModule's provider factory). The `text-embedding-3` models
 * support a `dimensions` parameter, so we shorten output to 768 to match the same
 * ContentChunk index / cosine setup as Gemini. NOTE: OpenAI embeddings live in a
 * DIFFERENT vector space than Gemini's — a provider switch requires a full
 * re-embed (retrieval is model-matched so stale-provider chunks are ignored).
 * There is no document/query task-type distinction, so `kind` is ignored.
 *
 *   OPEN_AI_API_KEY   OpenAI API key
 */
@Injectable()
export class OpenAiEmbeddingsProvider implements EmbeddingsProvider {
  private readonly logger = new Logger(OpenAiEmbeddingsProvider.name);
  private readonly apiKey = process.env.OPEN_AI_API_KEY;
  readonly model = MODEL;
  readonly dims = DIMS;

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async embed(texts: string[], _kind: EmbeddingKind): Promise<number[][]> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Embeddings are not configured (set OPEN_AI_API_KEY).',
      );
    }
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      out.push(...(await this.embedBatch(texts.slice(i, i + BATCH))));
    }
    return out;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey as string}`,
        },
        body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }),
      });
    } catch (err) {
      this.logger.error(
        `OpenAI embed request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException(
        'Embedding service is unavailable. Please try again.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `OpenAI embed returned ${res.status}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Embedding service error. Please try again.',
      );
    }

    const json = (await res.json()) as {
      data?: { index: number; embedding: number[] }[];
    };
    const data = json.data ?? [];
    if (data.length !== texts.length) {
      this.logger.error(
        `OpenAI returned ${data.length} embeddings for ${texts.length} inputs`,
      );
      throw new ServiceUnavailableException(
        'Embedding service returned an unexpected response.',
      );
    }
    // Order is not guaranteed — sort by the returned index.
    return data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
