import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmbeddingsProvider, EmbeddingKind } from './embeddings.provider';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-embedding-001';
const DIMS = 768; // gemini-embedding-001 defaults to 3072; we request 768 via MRL
const BATCH = 100; // batchEmbedContents accepts up to 100 requests per call

/**
 * Google Gemini embeddings (`gemini-embedding-001`). The model natively emits
 * 3072-dim vectors; we request `outputDimensionality: 768` (Matryoshka) to keep
 * storage small — fine for cosine similarity, which normalises internally. Uses
 * task types (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY) for better retrieval. The
 * API key is sent via the `x-goog-api-key` header (never logged / never in URL).
 *
 *   GEMINI_API_KEY   Google AI Studio key (free tier is sufficient)
 */
@Injectable()
export class GeminiEmbeddingsProvider implements EmbeddingsProvider {
  private readonly logger = new Logger(GeminiEmbeddingsProvider.name);
  private readonly apiKey = process.env.GEMINI_API_KEY;
  readonly model = MODEL;
  readonly dims = DIMS;

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Embeddings are not configured (set GEMINI_API_KEY).',
      );
    }
    if (texts.length === 0) return [];

    const taskType =
      kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      out.push(...(await this.embedBatch(batch, taskType)));
    }
    return out;
  }

  private async embedBatch(
    texts: string[],
    taskType: string,
  ): Promise<number[][]> {
    const url = `${GEMINI_BASE}/models/${MODEL}:batchEmbedContents`;
    const body = {
      requests: texts.map((t) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text: t }] },
        taskType,
        outputDimensionality: DIMS,
      })),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey as string,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(
        `Gemini embed request failed: ${
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
        `Gemini embed returned ${res.status}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Embedding service error. Please try again.',
      );
    }

    const json = (await res.json()) as {
      embeddings?: { values: number[] }[];
    };
    const embeds = json.embeddings ?? [];
    if (embeds.length !== texts.length) {
      this.logger.error(
        `Gemini returned ${embeds.length} embeddings for ${texts.length} inputs`,
      );
      throw new ServiceUnavailableException(
        'Embedding service returned an unexpected response.',
      );
    }
    return embeds.map((e) => e.values);
  }
}
