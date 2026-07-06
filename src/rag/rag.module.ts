import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagController } from './rag.controller';
import { IndexingService } from './indexing.service';
import { RetrievalService } from './retrieval.service';
import { GeminiEmbeddingsProvider } from './embeddings/gemini-embeddings.provider';
import { OpenAiEmbeddingsProvider } from './embeddings/openai-embeddings.provider';
import { EMBEDDINGS_PROVIDER } from './embeddings/embeddings.provider';
import { Logger } from '@nestjs/common';
import {
  ContentChunk,
  ContentChunkSchema,
} from './schema/content-chunk.schema';
import { CourseCard, CourseCardSchema } from './schema/course-card.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';

/**
 * RAG Phase 1: the embeddings provider + content index (chunking, embedding,
 * idempotent reindex/backfill). Phase 2 (retrieval + grounded tutor) will live
 * here too and consume IndexingService + EMBEDDINGS_PROVIDER + the ContentChunk
 * model — all exported below.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentChunk.name, schema: ContentChunkSchema },
      { name: CourseCard.name, schema: CourseCardSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [RagController],
  providers: [
    IndexingService,
    RetrievalService,
    GeminiEmbeddingsProvider,
    OpenAiEmbeddingsProvider,
    // Prefer Gemini; fall back to OpenAI only when GEMINI_API_KEY is unset.
    // (One provider at a time — vectors aren't cross-comparable; a switch needs a
    // full re-embed via /rag/backfill.)
    {
      provide: EMBEDDINGS_PROVIDER,
      inject: [GeminiEmbeddingsProvider, OpenAiEmbeddingsProvider],
      useFactory: (
        gemini: GeminiEmbeddingsProvider,
        openai: OpenAiEmbeddingsProvider,
      ) => {
        const logger = new Logger('EmbeddingsProvider');
        if (gemini.isConfigured) {
          logger.log(`Embeddings: Gemini (${gemini.model}, ${gemini.dims}d)`);
          return gemini;
        }
        if (openai.isConfigured) {
          logger.log(`Embeddings: OpenAI (${openai.model}, ${openai.dims}d)`);
          return openai;
        }
        logger.warn('Embeddings: no provider configured — RAG degrades to empty');
        return gemini; // unconfigured → callers already short-circuit on isConfigured
      },
    },
  ],
  exports: [
    IndexingService,
    RetrievalService,
    EMBEDDINGS_PROVIDER,
    MongooseModule,
  ],
})
export class RagModule {}
