/**
 * Provider-agnostic embeddings contract. RAG code depends ONLY on this
 * interface (via the EMBEDDINGS_PROVIDER token), so swapping Gemini for OpenAI
 * / a gateway model later is a single binding change in RagModule. Each stored
 * chunk records the `model` + `dims` it was embedded with, so a provider swap
 * can trigger a clean re-index.
 */
export type EmbeddingKind = 'document' | 'query';

export interface EmbeddingsProvider {
  /** Model identifier, persisted on every chunk. */
  readonly model: string;
  /** Output vector dimensionality. */
  readonly dims: number;
  /** True once the provider has its credentials. */
  readonly isConfigured: boolean;
  /**
   * Embed a batch of texts. `kind` lets the provider optimise for indexing
   * (`document`) vs. searching (`query`) when it supports task types.
   */
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

/** Nest DI token for the active EmbeddingsProvider. */
export const EMBEDDINGS_PROVIDER = Symbol('EMBEDDINGS_PROVIDER');
