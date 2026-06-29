import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagController } from './rag.controller';
import { IndexingService } from './indexing.service';
import { RetrievalService } from './retrieval.service';
import { GeminiEmbeddingsProvider } from './embeddings/gemini-embeddings.provider';
import { EMBEDDINGS_PROVIDER } from './embeddings/embeddings.provider';
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
    { provide: EMBEDDINGS_PROVIDER, useExisting: GeminiEmbeddingsProvider },
  ],
  exports: [
    IndexingService,
    RetrievalService,
    EMBEDDINGS_PROVIDER,
    MongooseModule,
  ],
})
export class RagModule {}
